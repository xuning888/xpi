// src/runner/subagent-runner.ts
import {Agent, AgentEvent, type AgentMessage} from '@earendil-works/pi-agent-core';
import {type AssistantMessage, type Model, streamSimple} from '@earendil-works/pi-ai/compat';
import {createCodingTools, createReadOnlyTools, type ExtensionAPI} from '@earendil-works/pi-coding-agent';
import type {AgentTool} from '@earendil-works/pi-agent-core';
import type {AgentDefinition} from '../definitions/types.ts';
import type {SubagentOptions, SubagentProgress, SubagentResult} from '../types.ts';
import {ProgressStreamer} from './progress-streamer.ts';
import {backgroundManager} from './background-manager.ts';

// ============================================================================
// Helpers
// ============================================================================

function isAssistantMessage(msg: AgentMessage): msg is AssistantMessage {
    return msg.role === 'assistant';
}

function extractTextContent(message: AssistantMessage): string {
    if (!message.content || !Array.isArray(message.content)) return '';
    return message.content
        .filter((c) => c.type === 'text')
        .map((c) => ('text' in c ? c.text : ''))
        .join('\n');
}

function sumUsage(messages: AgentMessage[]): SubagentResult['usage'] {
    let input = 0, output = 0, cacheRead = 0, cacheWrite = 0, totalTokens = 0;
    for (const msg of messages) {
        if (isAssistantMessage(msg) && msg.usage) {
            input += msg.usage.input || 0;
            output += msg.usage.output || 0;
            cacheRead += msg.usage.cacheRead || 0;
            cacheWrite += msg.usage.cacheWrite || 0;
            totalTokens += msg.usage.totalTokens || 0;
        }
    }
    return {input, output, cacheRead, cacheWrite, totalTokens};
}

function extractAgentError(messages: AgentMessage[]): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (isAssistantMessage(msg) && msg.stopReason === 'error' && msg.errorMessage) {
            return msg.errorMessage;
        }
    }
    return undefined;
}

// ============================================================================
// Tool Resolution
// ============================================================================

const ALL_TOOLS: Record<string, (cwd: string) => AgentTool[]> = {
    read: (cwd: string) => createReadOnlyTools(cwd).filter((t) => t.name === 'read'),
    bash: (cwd: string) => createCodingTools(cwd).filter((t) => t.name === 'bash'),
    edit: (cwd: string) => createCodingTools(cwd).filter((t) => t.name === 'edit'),
    write: (cwd: string) => createCodingTools(cwd).filter((t) => t.name === 'write'),
    grep: (cwd: string) => createReadOnlyTools(cwd).filter((t) => t.name === 'grep'),
    find: (cwd: string) => createReadOnlyTools(cwd).filter((t) => t.name === 'find'),
    ls: (cwd: string) => createReadOnlyTools(cwd).filter((t) => t.name === 'ls'),
};

function resolveTools(agent: AgentDefinition, cwd: string): AgentTool[] {
    const tools: AgentTool[] = [];
    if (agent.tools?.includes('*')) {
        tools.push(...createCodingTools(cwd));
        return tools;
    }
    if (agent.tools && agent.tools.length > 0) {
        // 白名单模式
        const denySet = new Set(agent.disallowedTools ?? []);
        for (const toolName of agent.tools) {
            if (denySet.has(toolName)) continue;
            const factory = ALL_TOOLS[toolName];
            if (factory) {
                tools.push(...factory(cwd));
            }
        }
    } else if (agent.disallowedTools && agent.disallowedTools.length > 0) {
        // 黑名单模式
        const denySet = new Set(agent.disallowedTools);
        for (const toolName of Object.keys(ALL_TOOLS)) {
            if (denySet.has(toolName)) continue;
            const factory = ALL_TOOLS[toolName];
            if (factory) {
                tools.push(...factory(cwd));
            }
        }
    } else {
        // 默认：所有编码工具
        tools.push(...createCodingTools(cwd));
    }

    return tools;
}

// ============================================================================
// Sub-agent Runner
// ============================================================================

export async function runSubagent(
    agentDef: AgentDefinition,
    options: SubagentOptions & { model: Model<any>; apiKey?: string },
    setStatus?: (text: string | undefined) => void,
    onUpdate?: (progress: SubagentProgress) => void,
): Promise<SubagentResult> {
    const systemPrompt = agentDef.getSystemPrompt();
    const tools = resolveTools(agentDef, options.cwd);

    const agent = new Agent({
        initialState: {
            systemPrompt,
            model: options.model,
            thinkingLevel: 'medium',
            tools,
        },
        streamFn: streamSimple,
        sessionId: `xpi-${agentDef.agentType}-${Date.now()}`,
        toolExecution: 'parallel',
        getApiKey: options.apiKey ? async () => options.apiKey : undefined,
        maxRetryDelayMs: 30_000,
    });

    const streamer = new ProgressStreamer(agentDef.agentType, setStatus, onUpdate);
    agent.subscribe((event: AgentEvent, _sig: AbortSignal) => {
        streamer.onAgentEvent(event);
    });

    let aborted = false;
    let errorMessage: string | undefined;

    try {
        await agent.prompt(options.prompt);
        await agent.waitForIdle();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('abort') || message.includes('Abort')) {
            aborted = true;
        } else {
            errorMessage = message;
        }
    }

    const messages = agent.state.messages;
    const usage = sumUsage(messages);

    if (!errorMessage && !aborted) {
        errorMessage = extractAgentError(messages);
    }
    // 构建 trace
    const outputParts: string[] = [];

    for (const msg of messages) {
        if (isAssistantMessage(msg)) {
            const text = extractTextContent(msg);
            const toolCalls = msg.content
                .filter(
                    (c): c is { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> } =>
                        c.type === 'toolCall',
                )
                .map((tc) => ({name: tc.name, arguments: tc.arguments}));
            if (text) outputParts.push(text);
        }
    }

    agent.reset();

    const finalOutput = outputParts.join('\n\n') || `(${agentDef.agentType} produced no output)`;
    streamer.finalize(finalOutput, usage, errorMessage, aborted);

    return {
        output: finalOutput,
        messages: [...messages],
        aborted,
        error: errorMessage,
        usage
    };
}

export function runSubagentBackground(
    agentDef: AgentDefinition,
    options: SubagentOptions & { model: Model<any>; apiKey?: string },
    setStatus?: (text: string | undefined) => void,
    onUpdate?: (progress: SubagentProgress) => void,
): string {
    const runId = `bg-${agentDef.agentType}-${Date.now()}`;
    const promise = runSubagent(agentDef, options, setStatus, onUpdate);
    backgroundManager.launch(runId, promise);
    return runId;
}