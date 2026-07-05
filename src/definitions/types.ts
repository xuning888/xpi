// src/definitions/types.ts

/** 思考深度 */
export type EffortLevel = 'minimal' | 'low' | 'medium' | 'high';

/** 权限模式 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';

/** Agent 来源 */
export type AgentSource = 'built-in' | 'user' | 'project' | 'plugin';

/** 所有 Agent 共有的基础字段 */
export interface BaseAgentDefinition {
  agentType: string;
  whenToUse: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: string; // 'inherit' | 'anthropic/claude-haiku-4-5' | ...
  getSystemPrompt: () => string;
}

/** 内置 Agent */
export interface BuiltInAgentDefinition extends BaseAgentDefinition {
  source: 'built-in';
  effort?: EffortLevel;
  maxTurns?: number;
  permissionMode?: PermissionMode;
  background?: boolean;
  memory?: 'user' | 'project';
}

/** 自定义 Agent（Markdown 或 JSON 文件定义） */
export interface CustomAgentDefinition extends BaseAgentDefinition {
  source: 'user' | 'project';
  filename: string;
  baseDir: string;
  effort?: EffortLevel;
  maxTurns?: number;
  permissionMode?: PermissionMode;
  background?: boolean;
  memory?: 'user' | 'project';
}

/** 所有 Agent 类型的联合 */
export type AgentDefinition = BuiltInAgentDefinition | CustomAgentDefinition;
