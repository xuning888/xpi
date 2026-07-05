// src/guard/index.ts
/**
 * 门禁模块入口。
 * 提供工具调用拦截和审批功能。
 */

// 类型导出
export type {
  GuardAction,
  GuardCondition,
  GuardRule,
  GuardConfig,
  ToolCallContext,
  GuardDecision,
} from './types.ts';

// 预定义规则导出
export {
  RULE_DANGEROUS_RM,
  RULE_SUDO,
  RULE_PERMISSIVE_CHMOD,
  RULE_SYSTEM_DIRS,
  RULE_CURL_PIPE,
  RULE_GIT_FORCE_PUSH,
  RULE_ENV_FILES,
  RULE_GIT_DIR,
  RULE_NODE_MODULES,
  RULE_CONFIG_FILES,
  DANGEROUS_COMMAND_RULES,
  PROTECTED_PATH_RULES,
  DEFAULT_RULES,
} from './rules.ts';

// 核心逻辑导出
export {
  evaluateGuard,
  registerGuard,
  createDefaultGuardConfig,
  createStrictGuardConfig,
} from './guard.ts';
