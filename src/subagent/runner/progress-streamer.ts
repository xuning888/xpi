// src/subagent/runner/progress-streamer.ts
import type {AgentEvent, AgentMessage} from '@earendil-works/pi-agent-core';
import type {AssistantMessage} from '@earendil-works/pi-ai/compat';
import type {SubagentProgress} from '../types.ts';

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

function emptyUsage(): SubagentProgress['usage'] {
    return {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0};
}

function addUsage(a: SubagentProgress['usage'], b: SubagentProgress['usage']): SubagentProgress['usage'] {
    return {
        input: a.input + b.input,
        output: a.output + b.output,
        cacheRead: a.cacheRead + b.cacheRead,
        cacheWrite: a.cacheWrite + b.cacheWrite,
        totalTokens: a.totalTokens + b.totalTokens,
    };
}

function toolCallKey(name: string, args: Record<string, unknown>): string {
    return `${name}:${JSON.stringify(args)}`;
}

const MAX_TOOL_CALLS_IN_PROGRESS = 20;

// ============================================================================
// ProgressStreamer
// ============================================================================

/**
 * 实时进度流式输出器。
 *
 * 订阅子 Agent 事件，构建 SubagentProgress 快照，通过 onUpdate 回调推送到
 * 父 Agent 的 TUI，同时在状态栏显示简洁进度。
 *
 * 用法：
 *   const streamer = new ProgressStreamer(agentType, pi, onUpdate);
 *   agent.subscribe((event) => streamer.onAgentEvent(event));
 *   // ... Agent 运行完成后:
 *   streamer.finalize(result);
 */
export class ProgressStreamer {
    private agentType: string;
    private setStatusFn: ((text: string | undefined) => void) | undefined;
    private onUpdate: ((progress: SubagentProgress) => void) | undefined;
    private progress: SubagentProgress;
    private enabled = true;

    constructor(
        agentType: string,
        setStatus?: (text: string | undefined) => void,
        onUpdate?: (progress: SubagentProgress) => void,
    ) {
        this.agentType = agentType;
        this.setStatusFn = setStatus;
        this.onUpdate = onUpdate;
        this.progress = {
            agentType,
            turns: 0,
            toolCalls: [],
            currentOutput: '',
            usage: emptyUsage(),
            status: 'running',
        };
        this.setStatus(`${agentType} running...`);
    }

    /** 处理 Agent 生命周期事件 */
    onAgentEvent(event: AgentEvent): void {
        if (!this.enabled) return;

        switch (event.type) {
            case 'turn_start':
                this.progress.turns++;
                this.setStatus(`${this.agentType} turn ${this.progress.turns}...`);
                break;

            case 'tool_execution_start':
                this.addToolCall(event.toolCallId, event.toolName, event.args);
                this.setStatus(
                    `${this.agentType} turn ${this.progress.turns}: ${event.toolName}...`,
                );
                break;

            case 'tool_execution_end':
                this.updateToolCall(event.toolCallId, event.toolName, event.result, event.isError);
                this.setStatus(`${this.agentType} turn ${this.progress.turns}`);
                break;
            case 'message_end': {
                const msg = event.message;
                if (isAssistantMessage(msg)) {
                    const text = extractTextContent(msg);
                    if (text) {
                        this.progress.currentOutput = text;
                    }
                    if (msg.usage) {
                        this.progress.usage = addUsage(this.progress.usage, {
                            input: msg.usage.input || 0,
                            output: msg.usage.output || 0,
                            cacheRead: msg.usage.cacheRead || 0,
                            cacheWrite: msg.usage.cacheWrite || 0,
                            totalTokens: msg.usage.totalTokens || 0,
                        });
                    }
                }
                break;
            }

            case 'agent_end':
                this.progress.status = 'completed';
                this.setStatus(`${this.agentType} done`);
                break;
        }

        this.emit();
    }

    /** 标记运行完成并推送最终状态 */
    finalize(output: string, usage: SubagentProgress['usage'], error?: string, aborted?: boolean): void {
        if (!this.enabled) return;

        this.progress.currentOutput = output || this.progress.currentOutput;
        this.progress.usage = usage;
        this.progress.status = aborted ? 'aborted' : error ? 'error' : 'completed';
        this.progress.errorMessage = error;
        this.setStatus(undefined); // 清除状态栏
        this.progress.toolCalls = this.progress.toolCalls.map((tc) =>
            tc.status === 'running' ? {...tc, status: 'success' as const} : tc,
        );
        this.emit();
    }

    // ---- 内部方法 ----

    private addToolCall(toolCallId: string, name: string, args: Record<string, unknown>): void {
        if (this.progress.toolCalls.length >= MAX_TOOL_CALLS_IN_PROGRESS) {
            this.progress.toolCalls.shift();
        }
        this.progress.toolCalls.push({toolCallId, name, args, status: 'running'});
    }

    private updateToolCall(toolCallId: string, name: string, result: unknown, isError: boolean): void {
        // 从后往前找最后一个 matching running toolCall
        for (let i = this.progress.toolCalls.length - 1; i >= 0; i--) {
            const tc = this.progress.toolCalls[i];
            if (tc.toolCallId === toolCallId && tc.status === 'running') {
                tc.status = isError ? 'error' : 'success';
                // 截取结果的前 100 字符作为预览
                try {
                    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
                    tc.resultPreview = resultStr.slice(0, 100);
                } catch {
                    tc.resultPreview = '[unavailable]';
                }
                return;
            }
        }
    }

    private emit(): void {
        if (this.onUpdate) {
            // 推送快照副本，避免外部修改内部状态
            this.onUpdate({...this.progress, toolCalls: [...this.progress.toolCalls], usage: {...this.progress.usage}});
        }
    }

    private setStatus(text: string | undefined): void {
        if (this.setStatusFn) {
            try {
                this.setStatusFn(text);
            } catch {
                // status line 可能不可用
            }
        }
    }
}
