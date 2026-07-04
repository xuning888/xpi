// src/index.ts
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { Model } from '@earendil-works/pi-ai/compat';
import { GENERAL_PURPOSE_AGENT } from './definitions/built-in/general-purpose.ts';
import { EXPLORE_AGENT } from './definitions/built-in/explore.ts';
import { PLAN_AGENT } from './definitions/built-in/plan.ts';
import { agentRegistry } from './definitions/registry.ts';
import { loadMarkdownAgents } from './definitions/markdown-loader.ts';
import { runSubagent } from './runner/subagent-runner.ts';
import { createAgentToolDefinition } from './tools/agent-tool.ts';

export default function xpi(pi: ExtensionAPI): void {
  // 注册内置 Agent
  agentRegistry.register(GENERAL_PURPOSE_AGENT);
  agentRegistry.register(EXPLORE_AGENT);
  agentRegistry.register(PLAN_AGENT);

  // 注册工具
  pi.registerTool(createAgentToolDefinition());

  // /agent 命令（交互模式）
  pi.registerCommand('agent', {
    description: 'Launch a sub-agent (Explore | Plan | general-purpose)',
    handler: async (args, ctx) => {
      if (!args?.trim()) {
        ctx.ui.notify('Usage: /agent <type> <description>', 'error');
        ctx.ui.notify('Types: ' + agentRegistry.typeNames().join(' | '), 'info');
        return;
      }
      const parts = args.trim().split(/\s+/);
      const type = parts[0];
      const description = parts.slice(1).join(' ');

      if (!agentRegistry.has(type)) {
        ctx.ui.notify(`Unknown type "${type}". Available: ${agentRegistry.typeNames().join(' | ')}`, 'error');
        return;
      }
      if (!description) { ctx.ui.notify('Please provide a task description', 'error'); return; }
      if (!ctx.model) { ctx.ui.notify('No model active', 'error'); return; }

      let apiKey: string | undefined;
      try {
        const authResult = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model as Model<any>);
        if (authResult.ok) apiKey = authResult.apiKey;
      } catch { /* env fallback */ }

      ctx.ui.notify(`Launching ${type} sub-agent: ${description}...`, 'info');
      const agentDef = agentRegistry.get(type)!;
      const result = await runSubagent(agentDef, {
        description, prompt: description, type, cwd: ctx.cwd, apiKey,
        model: ctx.model as Model<any>,
      });

      if (result.error) {
        ctx.ui.notify(`Failed: ${result.error}`, 'error');
        if (result.output) ctx.ui.notify(result.output.slice(0, 500), 'info');
        return;
      }

      if (result.trace) {
        for (const step of result.trace) {
          const tools = step.toolCalls.length > 0 ? step.toolCalls.map((tc) => tc.name).join(', ') : 'thinking';
          ctx.ui.notify(`  Turn ${step.turn} (${step.tokens.toLocaleString()}t) ${tools}`, 'info');
        }
      }
      ctx.ui.notify(`Done · ${result.usage.totalTokens.toLocaleString()} tokens`, 'info');
      ctx.ui.notify(result.output.slice(0, 2000), 'info');
    },
  });

  // Phase 2 hook
  // const customAgents = loadMarkdownAgents(ctx.cwd, '');
  // for (const agent of customAgents) agentRegistry.register(agent);
}
