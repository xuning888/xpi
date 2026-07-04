/**
 * xpi - Pi Extension: Sub-agent system
 *
 * Shared type definitions for agent types, teams, tasks, and mailbox messages.
 */

// ============================================================================
// Agent Types
// ============================================================================

/** Built-in sub-agent type identifiers. */
export type SubagentType = "general-purpose" | "Explore" | "Plan";

/** Allowed model names for sub-agent override. */
export type SubagentModel = "sonnet" | "opus" | "haiku";

/** Options for running a sub-agent. */
export interface SubagentOptions {
  /** 3-5 word task description. */
  description: string;
  /** The task prompt for the sub-agent. */
  prompt: string;
  /** Agent type determining tool set and system prompt. */
  type: SubagentType;
  /** Model override. Defaults to the parent agent's model. */
  model?: SubagentModel;
  /** Working directory for the sub-agent. */
  cwd: string;
  /** Whether to run asynchronously without waiting for completion. */
  runInBackground?: boolean;
  /** Sub-agent name for addressing (used in team messaging). */
  name?: string;
  /** Team name this sub-agent belongs to. */
  teamName?: string;
}

/** Result returned by a sub-agent run. */
export interface SubagentResult {
  /** Combined text output from the sub-agent's assistant messages. */
  output: string;
  /** All messages from the sub-agent's conversation. */
  messages: unknown[];
  /** Whether the run was aborted. */
  aborted: boolean;
  /** Error message if the run failed. */
  error?: string;
  /** Token usage across all assistant messages. */
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
  };
}

// ============================================================================
// Team Types
// ============================================================================

/** A team configuration. */
export interface Team {
  name: string;
  description?: string;
  createdAt: string;
  /** Agent names that are members of this team. */
  members: string[];
}

// ============================================================================
// Task Types
// ============================================================================

export type TaskStatus = "pending" | "in_progress" | "completed";

/** A task in a team's shared task list. */
export interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  /** Agent name assigned to this task. */
  owner?: string;
  /** Task IDs that must complete before this one. */
  blockedBy: string[];
  /** Task IDs that this task blocks. */
  blocks: string[];
  createdAt: string;
  completedAt?: string;
  /** Team name this task belongs to. */
  teamName: string;
}

// ============================================================================
// Mailbox Types
// ============================================================================

/** A message in an agent's mailbox. */
export interface MailboxMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  read: boolean;
}

// ============================================================================
// Agent Tool Input/Output
// ============================================================================

/** Validated input for the agent tool. */
export interface AgentToolInput {
  description: string;
  prompt: string;
  subagent_type?: string;
  model?: string;
  run_in_background?: boolean;
}