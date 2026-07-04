// src/tools/agent-tool.ts
import { Type } from 'typebox';
import type { Static } from 'typebox';
import type { Model } from '@earendil-works/pi-ai/compat';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { agentRegistry } from '../definitions/registry.ts';
import { runSubagent, runSubagentBackground } from '../runner/subagent-runner.ts';
import type { SubagentOptions } from '../types.ts';

const agentToolSchema = Type.Object({
  description: Type.String({ description: 'A short (3-5 word) description of the task for the sub-agent' }),
  prompt: Type.String({ description: 'The task for the sub-agent to perform. Be specific and detailed.' }),
  subagent_type: Type.Optional(
    Type.String({
      description: `The type of sub-agent to use. Available: ${agentRegistry.typeNames().join(', ')}. Defaults to "general-purpose".`,
      default: 'general-purpose',
    }),
  ),
  model: Type.Optional(
    Type.String({ description: 'Optional model override. If omitted, inherits parent model.' }),
  ),
  run_in_background: Type.Optional(
    Type.Boolean({ description: 'Run asynchronously without waiting.', default: false }),
  ),
});

function buildAgentListDescription(): string {
  return agentRegistry.listForPrompt();
}

export function createAgentToolDefinition(): ToolDefinition<typeof agentToolSchema, unknown> {
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

    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      const input = params as Static<typeof agentToolSchema>;
      const agentType = input.subagent_type ?? 'general-purpose';
      const agentDef = agentRegistry.get(agentType);

      if (!agentDef) {
        return {
          content: [{ type: 'text', text: `Unknown agent type: ${agentType}. Available: ${agentRegistry.typeNames().join(', ')}` }],
          details: {},
        };
      }

      if (!ctx.model) {
        return {
          content: [{ type: 'text', text: 'Error: No model is active. Select a model first.' }],
          details: {},
        };
      }

      let apiKey: string | undefined;
      try {
        const authResult = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model as Model<any>);
        if (authResult.ok) apiKey = authResult.apiKey;
      } catch { /* env fallback */ }

      const sendMessage = (msg: { customType: string; content: string; display: boolean; details?: unknown }) => {
        try {
          (ctx as any).sendMessage?.(msg);
        } catch { /* silent — progress messages are best-effort */ }
      };

      const subagentOptions: SubagentOptions = {
        description: input.description,
        prompt: input.prompt,
        type: agentType,
        cwd: ctx.cwd,
        apiKey,
        runInBackground: input.run_in_background ?? false,
      };

      if (input.run_in_background) {
        const runId = runSubagentBackground(agentDef, { ...subagentOptions, model: ctx.model as Model<any> }, sendMessage);
        return {
          content: [{ type: 'text', text: `Sub-agent launched in background.\nRun ID: \`${runId}\`\nType: ${agentType}\nDescription: ${input.description}` }],
          details: { runId, type: agentType, background: true },
        };
      }

      if (signal?.aborted) {
        return { content: [{ type: 'text', text: 'Aborted.' }], details: { aborted: true } };
      }

      const result = await runSubagent(agentDef, { ...subagentOptions, model: ctx.model as Model<any> }, sendMessage);

      if (result.aborted) {
        return { content: [{ type: 'text', text: 'Sub-agent aborted.' }], details: { aborted: true } };
      }

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Sub-agent error: ${result.error}\n\nPartial output:\n${result.output}` }],
          details: { error: result.error, usage: result.usage },
        };
      }

      const outputText = [
        `## Sub-agent Result (${agentType})`,
        `**Task**: ${input.description}`,
        `**Usage**: ${result.usage.totalTokens.toLocaleString()} tokens (in: ${result.usage.input}, out: ${result.usage.output})`,
        '',
        '---',
        '',
        result.output,
      ].join('\n');

      return {
        content: [{ type: 'text', text: outputText }],
        details: { type: agentType, usage: result.usage, messageCount: result.messages.length },
      };
    },
  });
}
