/**
 * xpi - Pi Extension: Sub-agent System
 *
 * Adds cc-haha style sub-agent capabilities to Pi.
 * Provides:
 *   - agent tool: Spawn sub-agents with different types (general-purpose, Explore, Plan)
 *   - send_message tool: Inter-agent messaging via file mailbox (Phase 2)
 *   - team_create tool: Create and manage agent teams (Phase 2)
 *   - task_create / task_update / task_list tools: Shared task tracking (Phase 3)
 *
 * ## Usage
 *
 * Install in a Pi project by adding to .pi/extensions/ or
 * referencing in package.json pi.extensions field.
 *
 * Once loaded, the main agent can call the "agent" tool to
 * spawn sub-agents for complex independent tasks.
 */

import { writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai/compat";
import { createAgentToolDefinition } from "./agent-tool.ts";
import { runSubagent } from "./subagent-runner.ts";
import { isValidSubagentType } from "./agent-types.ts";
import type { SubagentType } from "./types.ts";

/**
 * Extension entry point.
 *
 * Called by Pi's extension runner when the extension is loaded.
 * Registers all tools and event handlers.
 */
export default function xpi(pi: ExtensionAPI): void {
  // Debug: write a file to verify the extension loads
  writeFileSync("/tmp/xpi-loaded.txt", `xpi extension loaded at ${new Date().toISOString()}\n`);

  // =========================================================================
  // Phase 1: Core Agent Tool
  // =========================================================================
  try {
    const tool = createAgentToolDefinition();
    pi.registerTool(tool);
    writeFileSync("/tmp/xpi-tool-registered.txt", `Tool registered: ${tool.name}\n`);
  } catch (err) {
    writeFileSync("/tmp/xpi-error.txt", `Error registering agent tool: ${err}\n`);
  }

  // =========================================================================
  // Phase 2 (future): Communication + Team tools
  // =========================================================================
  // pi.registerTool(createSendMessageToolDefinition());
  // pi.registerTool(createTeamCreateToolDefinition());

  // =========================================================================
  // Phase 3 (future): Task system tools
  // =========================================================================
  // pi.registerTool(createTaskCreateToolDefinition());
  // pi.registerTool(createTaskUpdateToolDefinition());
  // pi.registerTool(createTaskListToolDefinition());

  // =========================================================================
  // Command: /agent - launch sub-agent directly from command line
  // =========================================================================

  pi.registerCommand("agent", {
    description: "Launch a sub-agent directly (Explore | Plan | general-purpose)",
    handler: async (args, ctx) => {
      if (!args || !args.trim()) {
        ctx.ui.notify("用法: /agent <类型> <描述>", "error");
        ctx.ui.notify("类型: Explore | Plan | general-purpose", "info");
        return;
      }

      // Parse: /agent Explore 探索当前目录
      const parts = args.trim().split(/\s+/);
      const type = parts[0];
      const description = parts.slice(1).join(" ");

      if (!isValidSubagentType(type)) {
        ctx.ui.notify(`无效类型 "${type}"，可用: Explore | Plan | general-purpose`, "error");
        return;
      }

      if (!description) {
        ctx.ui.notify("请提供任务描述", "error");
        return;
      }

      if (!ctx.model) {
        ctx.ui.notify("当前没有激活的模型", "error");
        return;
      }

      // Get API key from parent session
      let apiKey: string | undefined;
      try {
        const authResult = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model as Model<any>);
        if (authResult.ok) {
          apiKey = authResult.apiKey;
        }
      } catch {
        // env fallback
      }

      ctx.ui.notify(`🚀 启动 ${type} 子代理: ${description}...`, "info");

      const result = await runSubagent({
        description,
        prompt: description,
        type: type as SubagentType,
        cwd: ctx.cwd,
        model: ctx.model as Model<any>,
        apiKey,
      });

      if (result.error) {
        ctx.ui.notify(`子代理失败: ${result.error}`, "error");
        if (result.output) {
          ctx.ui.notify(result.output.slice(0, 500), "info");
        }
        return;
      }

      // Show trace
      if (result.trace && result.trace.length > 0) {
        for (const step of result.trace) {
          const tools = step.toolCalls.length > 0
            ? step.toolCalls.map(tc => tc.name).join(", ")
            : "💭";
          ctx.ui.notify(
            `  Turn ${step.turn} (${step.tokens.toLocaleString()}t) ${tools}`,
            "info",
          );
          if (step.text) {
            const firstLine = step.text.split("\n")[0].slice(0, 100);
            ctx.ui.notify(`    ${firstLine}`, "info");
          }
        }
      }

      ctx.ui.notify("", "info");
      ctx.ui.notify(
        `✅ 完成 · ${result.usage.totalTokens.toLocaleString()} tokens`,
        "info",
      );
      ctx.ui.notify("", "info");
      ctx.ui.notify(result.output.slice(0, 2000), "info");
    },
  });

  // =========================================================================
  // Event handlers
  // =========================================================================

  pi.on("agent_start", (_event, _ctx) => {
    // Future: update team member status to "busy"
  });

  pi.on("agent_end", (_event, _ctx) => {
    // Future: check mailbox for pending messages
  });
}
