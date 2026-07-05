// src/guard/types.ts
/**
 * 门禁模块类型定义。
 * 用于拦截和审批工具调用。
 */

/** 门禁动作 */
export type GuardAction = 'allow' | 'deny' | 'confirm';

/** 门禁规则匹配条件 */
export interface GuardCondition {
  /** 工具名称（支持通配符 '*'） */
  toolName?: string | string[];
  /** 正则表达式匹配命令内容（仅对 bash 工具有效） */
  commandPattern?: RegExp | RegExp[];
  /** 路径匹配（对 write/edit/read 工具有效） */
  pathPattern?: string | RegExp | Array<string | RegExp>;
}

/** 单条门禁规则 */
export interface GuardRule {
  /** 规则名称（用于日志和提示） */
  name: string;
  /** 规则描述 */
  description?: string;
  /** 匹配条件 */
  condition: GuardCondition;
  /** 匹配后的动作 */
  action: GuardAction;
  /** 确认提示消息（仅当 action 为 'confirm' 时使用） */
  confirmMessage?: string;
  /** 优先级（数字越大越先匹配，默认 0） */
  priority?: number;
}

/** 门禁配置 */
export interface GuardConfig {
  /** 是否启用门禁 */
  enabled?: boolean;
  /** 规则列表 */
  rules?: GuardRule[];
  /** 默认动作（未匹配任何规则时） */
  defaultAction?: GuardAction;
  /** 非交互模式下的默认动作 */
  nonInteractiveAction?: 'allow' | 'deny';
}

/** 工具调用上下文（用于规则匹配） */
export interface ToolCallContext {
  /** 工具名称 */
  toolName: string;
  /** 工具参数 */
  input: Record<string, unknown>;
  /** 提取的命令（bash 工具） */
  command?: string;
  /** 提取的路径（write/edit/read 工具） */
  path?: string;
}

/** 门禁决策结果 */
export interface GuardDecision {
  /** 是否允许执行 */
  allowed: boolean;
  /** 匹配的规则（如果有） */
  matchedRule?: GuardRule;
  /** 拒绝原因（如果被阻止） */
  reason?: string;
}
