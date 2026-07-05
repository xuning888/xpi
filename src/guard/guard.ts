// src/guard/guard.ts
/**
 * 门禁核心逻辑。
 * 拦截工具调用并根据规则进行审批。
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type {
  GuardConfig,
  GuardRule,
  GuardDecision,
  ToolCallContext,
  GuardCondition,
} from './types.ts';
import { DEFAULT_RULES } from './rules.ts';

// ============================================================================
// 工具调用上下文提取
// ============================================================================

/** 从工具调用事件中提取上下文信息 */
function extractToolCallContext(toolName: string, input: Record<string, unknown>): ToolCallContext {
  const ctx: ToolCallContext = { toolName, input };

  // 提取 bash 命令
  if (toolName === 'bash' && typeof input.command === 'string') {
    ctx.command = input.command;
  }

  // 提取路径（write/edit/read/grep/find/ls）
  if (typeof input.path === 'string') {
    ctx.path = input.path;
  }

  return ctx;
}

// ============================================================================
// 规则匹配
// ============================================================================

/** 检查工具名称是否匹配 */
function matchToolName(condition: GuardCondition, toolName: string): boolean {
  if (!condition.toolName) return true; // 未指定 = 匹配所有

  const patterns = Array.isArray(condition.toolName) ? condition.toolName : [condition.toolName];
  return patterns.some((p) => {
    if (p === '*') return true;
    return p === toolName;
  });
}

/** 检查命令是否匹配 */
function matchCommand(condition: GuardCondition, command?: string): boolean {
  if (!condition.commandPattern || !command) return true; // 未指定或无命令 = 跳过

  const patterns = Array.isArray(condition.commandPattern)
    ? condition.commandPattern
    : [condition.commandPattern];
  return patterns.some((p) => p.test(command));
}

/** 检查路径是否匹配 */
function matchPath(condition: GuardCondition, path?: string): boolean {
  if (!condition.pathPattern || !path) return true; // 未指定或无路径 = 跳过

  const patterns = Array.isArray(condition.pathPattern) ? condition.pathPattern : [condition.pathPattern];
  return patterns.some((p) => {
    if (typeof p === 'string') {
      return path.includes(p);
    }
    return p.test(path);
  });
}

/** 检查单条规则是否匹配 */
function matchRule(rule: GuardRule, ctx: ToolCallContext): boolean {
  // 工具名称必须匹配
  if (!matchToolName(rule.condition, ctx.toolName)) return false;

  // 如果规则指定了命令模式，必须匹配
  if (rule.condition.commandPattern && !matchCommand(rule.condition, ctx.command)) return false;

  // 如果规则指定了路径模式，必须匹配
  if (rule.condition.pathPattern && !matchPath(rule.condition, ctx.path)) return false;

  return true;
}

// ============================================================================
// 门禁决策
// ============================================================================

/** 根据规则列表做出门禁决策 */
export function evaluateGuard(
  rules: GuardRule[],
  ctx: ToolCallContext,
  defaultAction: 'allow' | 'deny' | 'confirm' = 'allow',
): GuardDecision {
  // 按优先级排序（高优先级先匹配）
  const sortedRules = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const rule of sortedRules) {
    if (matchRule(rule, ctx)) {
      return {
        allowed: rule.action === 'allow',
        matchedRule: rule,
        reason: rule.action === 'deny' ? `被规则 "${rule.name}" 阻止` : undefined,
      };
    }
  }

  // 未匹配任何规则，使用默认动作
  return {
    allowed: defaultAction === 'allow',
    reason: defaultAction === 'deny' ? '未匹配任何规则，使用默认拒绝策略' : undefined,
  };
}

// ============================================================================
// 门禁守卫（注册到 Pi 扩展）
// ============================================================================

/**
 * 创建并注册门禁守卫到 Pi 扩展。
 *
 * @param pi - Pi 扩展 API
 * @param config - 门禁配置
 */
export function registerGuard(pi: ExtensionAPI, config: GuardConfig = {}): void {
  const {
    enabled = true,
    rules = DEFAULT_RULES,
    defaultAction = 'allow',
    nonInteractiveAction = 'deny',
  } = config;

  if (!enabled) return;

  pi.on('tool_call', async (event, ctx) => {
    const toolCtx = extractToolCallContext(event.toolName, event.input);

    const decision = evaluateGuard(rules, toolCtx, defaultAction);

    // 允许执行
    if (decision.allowed) {
      return undefined;
    }

    // 被规则明确拒绝
    if (decision.matchedRule?.action === 'deny') {
      if (ctx.hasUI) {
        ctx.ui.notify(decision.reason ?? '操作被阻止', 'warning');
      }
      return { block: true, reason: decision.reason };
    }

    // 需要确认
    if (decision.matchedRule?.action === 'confirm') {
      // 非交互模式处理
      if (!ctx.hasUI) {
        return {
          block: nonInteractiveAction === 'deny',
          reason: nonInteractiveAction === 'deny' ? '非交互模式下拒绝需要确认的操作' : undefined,
        };
      }

      // 构建确认消息
      const rule = decision.matchedRule;
      let message = rule.confirmMessage ?? `操作 "${rule.name}" 需要确认`;

      // 添加详细信息
      if (toolCtx.command) {
        message += `\n\n命令: ${toolCtx.command}`;
      }
      if (toolCtx.path) {
        message += `\n路径: ${toolCtx.path}`;
      }

      // 弹出确认对话框
      const confirmed = await ctx.ui.confirm('门禁确认', message);

      if (!confirmed) {
        return { block: true, reason: '用户拒绝执行' };
      }
    }

    return undefined;
  });
}

// ============================================================================
// 便捷工厂函数
// ============================================================================

/**
 * 创建带默认规则的门禁配置。
 * 可以在此基础上自定义。
 */
export function createDefaultGuardConfig(overrides?: Partial<GuardConfig>): GuardConfig {
  return {
    enabled: true,
    rules: DEFAULT_RULES,
    defaultAction: 'allow',
    nonInteractiveAction: 'deny',
    ...overrides,
  };
}

/**
 * 创建严格门禁配置。
 * 所有写操作都需要确认。
 */
export function createStrictGuardConfig(overrides?: Partial<GuardConfig>): GuardConfig {
  return {
    enabled: true,
    rules: [
      ...DEFAULT_RULES,
      {
        name: 'all-writes',
        description: '所有写操作都需要确认',
        condition: {
          toolName: ['write', 'edit'],
        },
        action: 'confirm',
        confirmMessage: '检测到文件写入操作，是否允许？',
        priority: -10, // 低优先级，作为兜底
      },
      {
        name: 'all-bash',
        description: '所有 bash 命令都需要确认',
        condition: {
          toolName: 'bash',
        },
        action: 'confirm',
        confirmMessage: '检测到命令执行，是否允许？',
        priority: -10,
      },
    ],
    defaultAction: 'confirm',
    nonInteractiveAction: 'deny',
    ...overrides,
  };
}
