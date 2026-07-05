// src/subagent/tools/agent-tool.ts
import {Type} from 'typebox';
import type {Static} from 'typebox';
import type {Model} from '@earendil-works/pi-ai/compat';
import {Theme, ToolDefinition} from '@earendil-works/pi-coding-agent';
import {defineTool, getMarkdownTheme} from '@earendil-works/pi-coding-agent';
import {Container, Markdown, Spacer, Text} from '@earendil-works/pi-tui';
import {agentRegistry} from '../definitions/registry.ts';
import {runSubagent} from '../runner/subagent-runner.ts';
import type {SubagentOptions, SubagentProgress, SubagentResult, ToolCallTrace} from '../types.ts';
import type {AgentDefinition} from "../definitions/types.ts";

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
}

// ============================================================================
// Tool call display helpers
// ============================================================================

function formatToolCall(tc: ToolCallTrace, fg: (color: any, text: string) => string): string {
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

// ============================================================================
// Per-agent-type tool factory
// ============================================================================

/**
 * 为指定 agentType 创建独立的 Pi tool 定义。
 *
 * 三个内置 Agent 对应三个独立工具：
 * - `general-purpose` → tool name: `general-purpose`
 * - `Explore`         → tool name: `explore`
 * - `Plan`            → tool name: `plan`
 *
 * 每个工具共享相同的 execute / renderCall / renderResult 逻辑，
 * 只是 agentType 固定、tool name 和描述不同。
 */
export function createAgentToolDefinition(
    agentType: string,
): ToolDefinition<ReturnType<typeof makeSchema>, AgentToolDetails> {
    const agentDef = agentRegistry.get(agentType);

    if (!agentDef) {
        throw new Error(`Unknown agent type: ${agentType}. Available: ${agentRegistry.typeNames().join(', ')}`);
    }

    const toolName = agentType;
    const toolLabel = `${agentType} (Sub-agent)`;
    const description = agentDef.whenToUse;

    const schema = makeSchema(agentType);

    return defineTool({
        name: toolName,
        label: toolLabel,
        description,
        parameters: schema,
        renderShell: 'default',

        // ====================================================================
        // Execute
        // ====================================================================

        async execute(_toolCallId, params, signal, onUpdate, ctx) {
            const input = params as Static<typeof schema>;

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
            } catch { /* env fallback */ }

            const subagentOptions: SubagentOptions = {
                description: input.description,
                prompt: input.prompt,
                type: agentType,
                cwd: ctx.cwd,
                apiKey,
            };

            // 进度回调：将 ProgressStreamer 的输出通过 onUpdate 推送到 TUI
            const progressCallback = onUpdate
                ? (progress: SubagentProgress) => {
                    onUpdate({
                        content: [{type: 'text', text: progress.currentOutput || `Turn ${progress.turns}...`}],
                        details: { type: agentType, progress },
                    });
                }
                : undefined;

            // 状态栏回调
            const setStatus = (text: string | undefined) => {
                try { ctx.ui.setStatus('xpi-subagent', text); } catch { /* ignore */ }
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
                        text: `Sub-agent error: ${result.error}\n\nPartial output:\n${result.output}`,
                    }],
                    details: {type: agentType, error: result.error, usage: result.usage},
                };
            }

            const outputText = [
                `## Sub-agent Result (${agentType})`,
                `**Task**: ${input.description}`,
                `**Usage**: ${result.usage.totalTokens.toLocaleString()} tokens (in: ${result.usage.input}, out: ${result.usage.output})`,
                '---',
                result.output,
            ].filter(Boolean).join('\n');

            return {
                content: [{type: 'text', text: outputText}],
                details: {type: agentType, usage: result.usage, messageCount: result.messages.length},
            };
        },

        // ====================================================================
        // Render Call
        // ====================================================================

        renderCall(args, theme, _context) {
            const a = args as Static<typeof schema>;
            const desc = a.description ?? '...';
            const preview = desc.length > 60 ? `${desc.slice(0, 60)}...` : desc;

            let text =
                theme.fg('toolTitle', theme.bold(`${agentType} `));
            text += `\n  ${theme.fg('dim', preview)}`;
            return new Text(text, 0, 0);
        },

        // ====================================================================
        // Render Result
        // ====================================================================

        renderResult(result, {expanded}, theme, _context) {
            const details = result.details as AgentToolDetails | undefined;
            const mdTheme = getMarkdownTheme();

            // Aborted
            if (details?.aborted) {
                return new Text(theme.fg('warning', '⏳ Aborted.'), 0, 0);
            }

            const progress = details?.progress;
            const hasProgress = !!progress;

            // Error state (no progress)
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

            const icon = iconShow(progress.status, theme, true);

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
                        const tcIcon = iconShow(tc.status, theme, false);
                        container.addChild(
                            new Text(`${tcIcon} ${formatToolCall(tc, theme.fg.bind(theme))}`, 0, 0),
                        );
                    }
                } else {
                    const limit = 3;
                    let count = 0;
                    for (let i = toolCalls.length - 1; i >= 0 && count < limit; i--, count++) {
                        const tc = toolCalls[i];
                        const tcIcon = iconShow(tc.status, theme, false);
                        container.addChild(
                            new Text(`${tcIcon} ${formatToolCall(tc, theme.fg.bind(theme))}`, 0, 0),
                        );
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

// ============================================================================
// Helpers
// ============================================================================

/** 按 agentType 生成简化的参数 schema（无需 subagent_type 字段） */
function makeSchema(_agentType: string) {
    return Type.Object({
        description: Type.String({description: 'A short (3-5 word) description of the task'}),
        prompt: Type.String({description: 'The task to perform. Be specific and detailed.'}),
        model: Type.Optional(
            Type.String({description: 'Optional model override. If omitted, inherits parent model.'}),
        ),
    });
}
