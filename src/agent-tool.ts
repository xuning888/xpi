/**
 * xpi - AgentTool
 *
 * Registers the "agent" tool that allows the main agent to spawn sub-agents.
 * Sub-agents run in-process using Pi's Agent class with a tailored tool set.
 */

import { Type } from "typebox";
import type { Static } from "typebox";
import type { Model } from "@earendil-works/pi-ai/compat";
import type {
  ToolDefinition,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import {
  isValidSubagentType,
  VALID_SUBAGENT_TYPES,
} from "./agent-types.ts";
import { runSubagent, runSubagentBackground } from "./subagent-runner.ts";
import type { AgentToolInput, SubagentType } from "./types.ts";

// ============================================================================
// TypeBox Schema
// ============================================================================

const agentToolSchema = Type.Object({
  description: Type.String({
    description:
      "A short (3-5 word) description of the task for the sub-agent",
  }),
  prompt: Type.String({
    description:
      "The task for the sub-agent to perform. Be specific and detailed.",
  }),
  subagent_type: Type.Optional(
    Type.String({
      description: `The type of sub-agent to use. Available types: ${VALID_SUBAGENT_TYPES.join(", ")}. Defaults to "general-purpose" if not specified.`,
      default: "general-purpose",
    }),
  ),
  model: Type.Optional(
    Type.String({
      description:
        "Optional model override for the sub-agent. Use model ID like 'sonnet', 'opus', or 'haiku'. If omitted, inherits the parent's model.",
    }),
  ),
  run_in_background: Type.Optional(
    Type.Boolean({
      description:
        "If true, run the sub-agent asynchronously and return immediately with a run ID. Use task_list to check status later.",
      default: false,
    }),
  ),
});

// ============================================================================
// Tool Definition
// ============================================================================

export function createAgentToolDefinition(): ToolDefinition<
  typeof agentToolSchema,
  unknown
> {
  return defineTool({
    name: "agent",
    label: "Agent (Sub-agent)",
    description:
      "Launch a sub-agent to handle complex, multi-step tasks autonomously. The sub-agent has its own tool set and works independently. Use this for: delegating research tasks, exploring code, planning implementations, or any task that benefits from focused, independent execution.",
    promptSnippet:
      "Launch sub-agents for complex tasks (research, exploration, planning)",
    promptGuidelines: [
      "Use the agent tool for complex multi-step tasks that benefit from focused independent execution",
      "Choose the appropriate sub-agent type: general-purpose for coding/editing, Explore for search/read-only tasks, Plan for analysis and planning",
      "Sub-agents cannot spawn additional sub-agents, so give them complete, self-contained tasks",
      "Sub-agents work independently and return a summary when done - do not micromanage them",
    ],
    parameters: agentToolSchema,
    renderShell: "default",

    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      const input = params as Static<typeof agentToolSchema>;

      // Resolve sub-agent type
      const subagentType = isValidSubagentType(input.subagent_type ?? "")
        ? (input.subagent_type as SubagentType)
        : "general-purpose";

      // Validate model
      if (!ctx.model) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No model is currently active. Please select a model before using the agent tool.",
            },
          ],
          details: {},
        };
      }

      // Build sub-agent options
      const subagentOptions = {
        description: input.description,
        prompt: input.prompt,
        type: subagentType,
        cwd: ctx.cwd,
        model: ctx.model as Model<any>,
        runInBackground: input.run_in_background ?? false,
      };

      // Background mode: launch and return immediately
      if (subagentOptions.runInBackground) {
        const runId = runSubagentBackground(subagentOptions);
        return {
          content: [
            {
              type: "text",
              text: `Sub-agent launched in background.\nRun ID: \`${runId}\`\nType: ${subagentType}\nDescription: ${input.description}\n\nThe sub-agent is working asynchronously. Its output will be available when it completes.`,
            },
          ],
          details: { runId, type: subagentType, background: true },
        };
      }

      // Synchronous mode: run and wait
      // Check abort signal
      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "Sub-agent execution was aborted." }],
          details: { aborted: true },
        };
      }

      const result = await runSubagent(subagentOptions);

      if (result.aborted) {
        return {
          content: [
            { type: "text", text: "Sub-agent execution was aborted." },
          ],
          details: { aborted: true },
        };
      }

      if (result.error) {
        return {
          content: [
            {
              type: "text",
              text: `Sub-agent failed with error: ${result.error}\n\nPartial output:\n${result.output}`,
            },
          ],
          details: { error: result.error, usage: result.usage },
        };
      }

      // Format the successful result
      const outputText = [
        `## Sub-agent Result (${subagentType})`,
        `**Task**: ${input.description}`,
        ``,
        `**Usage**: ${result.usage.totalTokens.toLocaleString()} tokens (in: ${result.usage.input.toLocaleString()}, out: ${result.usage.output.toLocaleString()})`,
        ``,
        `---`,
        ``,
        result.output,
      ].join("\n");

      return {
        content: [{ type: "text", text: outputText }],
        details: {
          type: subagentType,
          usage: result.usage,
          messageCount: result.messages.length,
        },
      };
    },
  });
}