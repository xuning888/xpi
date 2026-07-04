// src/types.ts
// 全局类型定义。AgentDefinition 相关类型在 definitions/types.ts。

/** 子代理类型标识 */
export type SubagentType = 'general-purpose' | 'Explore' | 'Plan';

/** 子代理运行选项 */
export interface SubagentOptions {
  description: string;
  prompt: string;
  type: string;
  cwd: string;
  runInBackground?: boolean;
  apiKey?: string;
  name?: string;
  teamName?: string;
}

/** 子代理工作步骤（用于 trace 展示） */
export interface SubagentTraceStep {
  turn: number;
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  text: string;
  tokens: number;
}

/** 子代理运行结果 */
export interface SubagentResult {
  output: string;
  messages: unknown[];
  aborted: boolean;
  error?: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
  };
  trace?: SubagentTraceStep[];
}

/** Agent tool 的 TypeBox 验证后的输入 */
export interface AgentToolInput {
  description: string;
  prompt: string;
  subagent_type?: string;
  model?: string;
  run_in_background?: boolean;
}

// ============================================================================
// Phase 2/3 预备类型
// ============================================================================

export interface Team {
  name: string;
  description?: string;
  createdAt: string;
  members: string[];
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  owner?: string;
  blockedBy: string[];
  blocks: string[];
  createdAt: string;
  completedAt?: string;
  teamName: string;
}

export interface MailboxMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  read: boolean;
}
