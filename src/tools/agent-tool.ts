// src/tools/agent-tool.ts
import {Type} from 'typebox';
import type {Static} from 'typebox';
import type {Model} from '@earendil-works/pi-ai/compat';
import {ExtensionAPI, Theme, ToolDefinition} from '@earendil-works/pi-coding-agent';
import {defineTool, getMarkdownTheme} from '@earendil-works/pi-coding-agent';
import {Container, Markdown, Spacer, Text, truncateToWidth} from '@earendil-works/pi-tui';
import {agentRegistry} from '../definitions/registry.ts';
import {runSubagent, runSubagentBackground} from '../runner/subagent-runner.ts';
import type {SubagentOptions, SubagentProgress, SubagentResult, ToolCallTrace} from '../types.ts';

// ============================================================================
// Details type for TUI rendering
// ============================================================================

interface AgentToolDetails {
    type: string;
    usage?: SubagentResult['usage'];
    messageCount?: number;
    progress?: SubagentProgress;
    aborted?: boolean;
    error?: string;
    background?: boolean;
    runId?: string;
}

// ============================================================================
// Tool call display helpers
// ============================================================================

function formatToolCall(tc: ToolCallTrace, fg: (color: any, text: string) => string): string {
    debugger;
    const argsStr = JSON.stringify(tc.args);
    return fg('muted', '→ ') + fg('accent', tc.name) + fg('dim', ` ${argsStr}`);
}

function formatTokens(count: number): string {
    if (count < 1000) return count.toString();
    if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
    if (count < 1000000) return `${Math.round(count / 1000)}k`;
    return `${(count / 1000000).toFixed(1)}M`;
}

function formatUsageLine(usage: SubagentResult['usage']): string {
    const parts: string[] = [];
    if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
    if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
    if (usage.totalTokens) parts.push(`${formatTokens(usage.totalTokens)}t`);
    return parts.join(' ');
}

// ============================================================================
// Schema
// ============================================================================

const agentToolSchema = Type.Object({
    description: Type.String({description: 'A short (3-5 word) description of the task for the sub-agent'}),
    prompt: Type.String({description: 'The task for the sub-agent to perform. Be specific and detailed.'}),
    subagent_type: Type.Optional(
        Type.String({
            description: `The type of sub-agent to use. Available: ${agentRegistry.typeNames().join(', ')}. Defaults to "general-purpose".`,
            default: 'general-purpose',
        }),
    ),
    model: Type.Optional(
        Type.String({description: 'Optional model override. If omitted, inherits parent model.'}),
    )
});

function buildAgentListDescription(): string {
    return agentRegistry.listForPrompt();
}

// ============================================================================
// Tool definition
// ============================================================================

export function createAgentToolDefinition(pi: ExtensionAPI): ToolDefinition<typeof agentToolSchema, AgentToolDetails> {
    return defineTool({
        name: 'agent',
        label: 'Agent (Sub-agent)',
        description: `Launch a new agent to handle complex, multi-step tasks autonomously. Each agent type has specific capabilities and tools available to it. Specify a subagent_type to select which agent type to use. If omitted, the general-purpose agent is used.

Available agent types and the tools they have access to:
${buildAgentListDescription()}

When NOT to use the agent tool:
- If you want to read a specific file path, use the read tool instead
- If you are searching for a specific class or keyword, use grep instead
- Simple single-step operations

Usage notes:
- Always include a short description (3-5 words)
- Sub-agents cannot spawn additional sub-agents
- Choose the right agent type: Explore/Plan for read-only, general-purpose for coding
- Sub-agents work independently and return a summary when done`,
        promptSnippet: 'Launch sub-agents for complex tasks (research, exploration, planning, coding)',
        promptGuidelines: [
            'Use the agent tool for complex multi-step tasks that benefit from focused independent execution',
            `Choose the appropriate sub-agent type: ${agentRegistry.typeNames().join(', ')}`,
            'Sub-agents cannot spawn additional sub-agents, so give them complete tasks',
            'Sub-agents work independently and return a summary when done — do not micromanage',
        ],
        parameters: agentToolSchema,
        renderShell: 'default',

        // ========================================================================
        // Execute
        // ========================================================================

        async execute(toolCallId, params, signal, onUpdate, ctx) {
            const input = params as Static<typeof agentToolSchema>;
            const agentType = input.subagent_type ?? 'general-purpose';
            const agentDef = agentRegistry.get(agentType);

            if (!agentDef) {
                return {
                    content: [{
                        type: 'text',
                        text: `Unknown agent type: ${agentType}. Available: ${agentRegistry.typeNames().join(', ')}`
                    }],
                    details: {type: agentType},
                };
            }

            if (!ctx.model) {
                return {
                    content: [{type: 'text', text: 'Error: No model is active. Select a model first.'}],
                    details: {type: agentType},
                };
            }

            let apiKey: string | undefined;
            try {
                const authResult = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model as Model<any>);
                if (authResult.ok) apiKey = authResult.apiKey;
            } catch { /* env fallback */
            }

            const subagentOptions: SubagentOptions = {
                description: input.description,
                prompt: input.prompt,
                type: agentType,
                cwd: ctx.cwd,
                apiKey
            };

            // 进度回调：将 ProgressStreamer 的输出通过 onUpdate 推送到 TUI
            const progressCallback = onUpdate
                ? (progress: SubagentProgress) => {
                    onUpdate({
                        content: [{type: 'text', text: progress.currentOutput || `Turn ${progress.turns}...`}],
                        details: {
                            type: agentType,
                            progress,
                        },
                    });
                }
                : undefined;

            // 状态栏回调
            const setStatus = (text: string | undefined) => {
                try {
                    ctx.ui.setStatus('xpi-subagent', text);
                } catch { /* 不可用时忽略 */
                }
            };

            if (signal?.aborted) {
                return {content: [{type: 'text', text: 'Aborted.'}], details: {type: agentType, aborted: true}};
            }

            const result = await runSubagent(
                agentDef,
                {...subagentOptions, model: ctx.model as Model<any>},
                setStatus,
                progressCallback,
            );

            if (result.aborted) {
                return {
                    content: [{type: 'text', text: 'Sub-agent aborted.'}],
                    details: {type: agentType, aborted: true, usage: result.usage},
                };
            }

            if (result.error) {
                return {
                    content: [{
                        type: 'text',
                        text: `Sub-agent error: ${result.error}\n\nPartial output:\n${result.output}`
                    }],
                    details: {type: agentType, error: result.error, usage: result.usage},
                };
            }

            const outputText = [
                `## Sub-agent Result (${agentType})`,
                `**Task**: ${input.description}`,
                `**Usage**: ${result.usage.totalTokens.toLocaleString()} tokens (in: ${result.usage.input}, out: ${result.usage.output})`,
                '---',
                '',
                result.output,
            ].filter(Boolean).join('\n');

            return {
                content: [{type: 'text', text: outputText}],
                details: {type: agentType, usage: result.usage, messageCount: result.messages.length},
            };
        },

        // ========================================================================
        // Render Call
        // ========================================================================

        renderCall(args, theme, _context) {
            const agentType = (args as Static<typeof agentToolSchema>).subagent_type ?? 'general-purpose';
            const description = (args as Static<typeof agentToolSchema>).description ?? '...';
            const preview = description.length > 60 ? `${description.slice(0, 60)}...` : description;

            let text =
                theme.fg('toolTitle', theme.bold('agent ')) +
                theme.fg('accent', agentType);
            text += `\n  ${theme.fg('dim', preview)}`;
            return new Text(text, 0, 0);
        },

        // ========================================================================
        // Render Result
        // ========================================================================

        renderResult(result, {expanded}, theme, _context) {
            const details = result.details as AgentToolDetails | undefined;
            const mdTheme = getMarkdownTheme();

            // Background mode
            if (details?.background) {
                return new Text(
                    theme.fg('muted', `Background agent launched.\nRun ID: ${details.runId ?? 'unknown'}\nType: ${details.type}`),
                    0, 0,
                );
            }

            // Aborted
            if (details?.aborted) {
                return new Text(theme.fg('warning', '⏳ Aborted.'), 0, 0);
            }

            const progress = details?.progress;
            const hasProgress = !!progress;

            // Error state
            if (!hasProgress && details?.error) {
                return new Text(theme.fg('error', `✗ ${details.type}: ${details.error}`), 0, 0);
            }

            // Legacy result (no progress data) — simple text display
            if (!hasProgress) {
                const text = result.content[0];
                return new Text(text?.type === 'text' ? text.text : '(no output)', 0, 0);
            }

            // ---- Progress-based rendering ----
            const isError = progress.status === 'error' || progress.status === 'aborted';

            let icon = iconShow(progress.status, theme, true);

            const toolCalls = progress.toolCalls;

            const usageStr = formatUsageLine(progress.usage);

            const container = new Container();

            // Header
            let header = `${icon} ${theme.fg('toolTitle', theme.bold(progress.agentType))}`;
            header += theme.fg('muted', ` · ${progress.turns} turn${progress.turns !== 1 ? 's' : ''}`);
            if (isError && progress.errorMessage) {
                header += ` ${theme.fg('error', `[${progress.errorMessage}]`)}`;
            }
            if (usageStr) header += theme.fg('dim', ` · ${usageStr}`);
            container.addChild(new Text(header, 0, 0));

            // Tool calls
            if (toolCalls.length > 0) {
                container.addChild(new Spacer(1));
                container.addChild(new Text(theme.fg('muted', '─── Tool Calls ───'), 0, 0));

                if (expanded) {
                    for (let i = toolCalls.length - 1; i >= 0; i--) {
                        const tc = toolCalls[i];
                        const tcIcon = iconShow(tc.status, theme, false)
                        container.addChild(
                            new Text(`${tcIcon} ${formatToolCall(tc, theme.fg.bind(theme))}`, 0, 0),
                        );
                    }
                } else {
                    let limit = 3;
                    let count = 0;
                    for (let i = toolCalls.length - 1; i >= 0; i--) {
                        if (count >= limit) {
                            break;
                        }
                        const tc = toolCalls[i];
                        const tcIcon = iconShow(tc.status, theme, false);
                        container.addChild(
                            new Text(`${tcIcon} ${formatToolCall(tc, theme.fg.bind(theme))}`, 0, 0),
                        );
                        count++;
                    }
                }
            }
            // Output
            if (progress.currentOutput) {
                container.addChild(new Spacer(1));
                container.addChild(new Text(theme.fg('muted', '─── Output ───'), 0, 0));
                container.addChild(new Markdown(progress.currentOutput.trim(), 0, 0, mdTheme));
            }
            return container;
        },
    });
}

function iconShow(status: string, theme: Theme, head: boolean) {
    const isRunning = status === 'running';
    const isError = status === 'error' || status === 'aborted';
    let icon: string;
    if (isRunning) {
        icon = theme.fg('warning', '⏳')
    } else {
        if (isError) {
            icon = theme.fg('error', '✗');
        } else {
            if (head) {
                icon = theme.fg('success', '⏳')
            } else {
                icon = theme.fg('success', '✓')
            }
        }
    }
    return icon;
}
