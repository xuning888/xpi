// src/guard/rules.ts
/**
 * 预定义门禁规则。
 * 提供常用的危险操作检测规则。
 */

import type { GuardRule } from './types.ts';

// ============================================================================
// 危险命令规则
// ============================================================================

/** rm -rf 等递归删除 */
export const RULE_DANGEROUS_RM: GuardRule = {
  name: 'dangerous-rm',
  description: '检测递归删除命令',
  condition: {
    toolName: 'bash',
    commandPattern: /\brm\s+(-rf?|--recursive)\b/i,
  },
  action: 'confirm',
  confirmMessage: '检测到递归删除命令，是否允许执行？',
  priority: 10,
};

/** sudo 命令 */
export const RULE_SUDO: GuardRule = {
  name: 'sudo',
  description: '检测 sudo 提权命令',
  condition: {
    toolName: 'bash',
    commandPattern: /\bsudo\b/i,
  },
  action: 'confirm',
  confirmMessage: '检测到 sudo 命令，是否允许执行？',
  priority: 10,
};

/** chmod/chown 777 */
export const RULE_PERMISSIVE_CHMOD: GuardRule = {
  name: 'permissive-chmod',
  description: '检测过于宽松的权限设置',
  condition: {
    toolName: 'bash',
    commandPattern: /\b(chmod|chown)\b.*777/i,
  },
  action: 'confirm',
  confirmMessage: '检测到 777 权限设置，是否允许执行？',
  priority: 10,
};

/** 系统关键目录操作 */
export const RULE_SYSTEM_DIRS: GuardRule = {
  name: 'system-dirs',
  description: '检测系统关键目录操作',
  condition: {
    toolName: 'bash',
    commandPattern: /\b(rm|mv|cp|chmod|chown)\b.*\s(\/etc|\/usr|\/var|\/bin|\/sbin|\/boot)\b/i,
  },
  action: 'confirm',
  confirmMessage: '检测到系统关键目录操作，是否允许执行？',
  priority: 15,
};

/** 网络下载执行 */
export const RULE_CURL_PIPE: GuardRule = {
  name: 'curl-pipe',
  description: '检测 curl | sh 类型的远程代码执行',
  condition: {
    toolName: 'bash',
    commandPattern: /\bcurl\b.*\|\s*(sh|bash|zsh)/i,
  },
  action: 'confirm',
  confirmMessage: '检测到远程代码执行模式（curl | sh），是否允许？',
  priority: 20,
};

/** Git 强制推送 */
export const RULE_GIT_FORCE_PUSH: GuardRule = {
  name: 'git-force-push',
  description: '检测 Git 强制推送',
  condition: {
    toolName: 'bash',
    commandPattern: /\bgit\s+push\b.*--force/i,
  },
  action: 'confirm',
  confirmMessage: '检测到 Git 强制推送，是否允许？',
  priority: 10,
};

// ============================================================================
// 受保护路径规则
// ============================================================================

/** 环境变量文件 */
export const RULE_ENV_FILES: GuardRule = {
  name: 'env-files',
  description: '保护环境变量文件',
  condition: {
    toolName: ['write', 'edit'],
    pathPattern: [/\.env(\..+)?$/, /\.env\.local$/],
  },
  action: 'confirm',
  confirmMessage: '检测到环境变量文件修改，是否允许？',
  priority: 10,
};

/** Git 目录 */
export const RULE_GIT_DIR: GuardRule = {
  name: 'git-dir',
  description: '保护 .git 目录',
  condition: {
    toolName: ['write', 'edit'],
    pathPattern: /\.git\//,
  },
  action: 'deny',
  priority: 20,
};

/** Node modules */
export const RULE_NODE_MODULES: GuardRule = {
  name: 'node-modules',
  description: '保护 node_modules 目录',
  condition: {
    toolName: ['write', 'edit'],
    pathPattern: /node_modules\//,
  },
  action: 'deny',
  priority: 20,
};

/** 配置文件 */
export const RULE_CONFIG_FILES: GuardRule = {
  name: 'config-files',
  description: '保护关键配置文件',
  condition: {
    toolName: ['write', 'edit'],
    pathPattern: [
      /package\.json$/,
      /tsconfig\.json$/,
      /\.eslintrc/,
      /\.prettierrc/,
    ],
  },
  action: 'confirm',
  confirmMessage: '检测到配置文件修改，是否允许？',
  priority: 5,
};

// ============================================================================
// 规则集合
// ============================================================================

/** 默认危险命令规则集 */
export const DANGEROUS_COMMAND_RULES: GuardRule[] = [
  RULE_DANGEROUS_RM,
  RULE_SUDO,
  RULE_PERMISSIVE_CHMOD,
  RULE_SYSTEM_DIRS,
  RULE_CURL_PIPE,
  RULE_GIT_FORCE_PUSH,
];

/** 默认受保护路径规则集 */
export const PROTECTED_PATH_RULES: GuardRule[] = [
  RULE_ENV_FILES,
  RULE_GIT_DIR,
  RULE_NODE_MODULES,
  RULE_CONFIG_FILES,
];

/** 所有默认规则 */
export const DEFAULT_RULES: GuardRule[] = [
  ...DANGEROUS_COMMAND_RULES,
  ...PROTECTED_PATH_RULES,
];
