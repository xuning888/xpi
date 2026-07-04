/**
 * xpi - Agent type configurations
 *
 * Defines the tool sets, system prompts, and configurations
 * for each built-in sub-agent type.
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  createCodingTools,
  createReadOnlyTools,
} from "@earendil-works/pi-coding-agent";
import type { SubagentType } from "./types.ts";

// ============================================================================
// Agent Type Configuration
// ============================================================================

export interface AgentTypeConfig {
  /** Display label. */
  label: string;
  /** System prompt prefix added before the task description. */
  systemPromptPrefix: string;
  /** Factory to create the tool set for this agent type. */
  createTools: (cwd: string) => AgentTool[];
  /** Banned tool names (prevent sub-agent from calling these). */
  bannedTools: string[];
}

/** All built-in agent type configurations. */
export const AGENT_TYPE_CONFIGS: Record<SubagentType, AgentTypeConfig> = {
  "general-purpose": {
    label: "General Purpose",
    systemPromptPrefix: `You are a sub-agent dispatched to complete a specific task.
Work autonomously and efficiently. Focus only on the assigned task.
When you complete the task, provide a clear summary of what you did and what you found.
Do not spawn additional sub-agents.`,
    createTools: (cwd: string) => createCodingTools(cwd),
    bannedTools: ["agent", "team_create", "send_message", "task_create", "task_update", "task_list"],
  },

  Explore: {
    label: "Explore",
    systemPromptPrefix: `You are a read-only exploration sub-agent.
Your task is to search, read, and analyze code. You CANNOT modify any files.
Use the available search and read tools to complete your task.
When you complete the task, provide a clear summary of what you found.
Do not attempt to write or edit files. Do not spawn additional sub-agents.`,
    createTools: (cwd: string) => createReadOnlyTools(cwd),
    bannedTools: ["agent", "team_create", "send_message", "task_create", "task_update", "task_list"],
  },

  Plan: {
    label: "Plan",
    systemPromptPrefix: `You are a planning sub-agent.
Your task is to analyze code and design an implementation plan.
You CAN read files, search code, and run read-only shell commands.
You CANNOT modify any files or run destructive commands.
Focus on understanding the problem and proposing a clear, actionable plan.
When you complete the task, provide a detailed plan with concrete steps.
Do not spawn additional sub-agents.`,
    createTools: (cwd: string) => {
      // Plan agent gets read-only tools for analysis
      return createReadOnlyTools(cwd);
    },
    bannedTools: ["agent", "team_create", "send_message", "task_create", "task_update", "task_list"],
  },
};

/** Get the configuration for a given agent type, falling back to general-purpose. */
export function getAgentTypeConfig(type: string): AgentTypeConfig {
  if (type in AGENT_TYPE_CONFIGS) {
    return AGENT_TYPE_CONFIGS[type as SubagentType];
  }
  return AGENT_TYPE_CONFIGS["general-purpose"];
}

/** Build the full system prompt for a sub-agent. */
export function buildSubagentSystemPrompt(
  type: SubagentType,
  description: string,
): string {
  const config = getAgentTypeConfig(type);
  return `${config.systemPromptPrefix}

## Task

${description}

## Important

- Work step by step
- Be thorough and precise
- When finished, summarize your findings clearly
- Do NOT call the "agent" tool to spawn additional sub-agents`;
}

/** List of valid sub-agent type names. */
export const VALID_SUBAGENT_TYPES: string[] = Object.keys(AGENT_TYPE_CONFIGS);

/** Check if a string is a valid sub-agent type. */
export function isValidSubagentType(type: string): type is SubagentType {
  return type in AGENT_TYPE_CONFIGS;
}