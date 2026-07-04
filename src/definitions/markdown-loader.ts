// src/definitions/markdown-loader.ts
import type { CustomAgentDefinition } from './types.ts';

/**
 * 从 .pi/agents/*.md 加载自定义 Agent 定义。
 * Phase 1 骨架：返回空数组。Phase 2 实现 YAML frontmatter 解析。
 */
export function loadMarkdownAgents(_cwd: string, _agentDir: string): CustomAgentDefinition[] {
  return [];
}
