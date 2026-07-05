// src/types.ts
// 全局类型定义。AgentDefinition 相关类型在 definitions/types.ts。

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
}

// ============================================================================
// 进度展示相关类型（通用，任何子 Agent 均可使用）
// ============================================================================

/** 单次工具调用的追踪信息 */
export interface ToolCallTrace {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
  resultPreview?: string;
}

/** 子 Agent 实时进度快照。
 *  ProgressStreamer 在每个 AgentEvent 后更新此对象并通过 onUpdate 推送。 */
export interface SubagentProgress {
  agentType: string;
  turns: number;
  toolCalls: ToolCallTrace[];
  currentOutput: string;
  usage: SubagentResult['usage'];
  status: 'running' | 'completed' | 'error' | 'aborted';
  errorMessage?: string;
}
