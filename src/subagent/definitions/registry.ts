// src/subagent/definitions/registry.ts
import type { AgentDefinition } from './types.ts';

/**
 * Agent 注册表。
 * 通过 AgentType 名称索引所有已注册的 Agent。
 * 同名 Agent 按加载优先级覆盖。
 */
export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();

  /** 注册一个 Agent。同名覆盖。 */
  register(def: AgentDefinition): void {
    this.agents.set(def.agentType, def);
  }

  /** 按名称获取 Agent */
  get(type: string): AgentDefinition | undefined {
    return this.agents.get(type);
  }

  /** 获取所有 Agent */
  getAll(): AgentDefinition[] {
    return [...this.agents.values()];
  }

  /** 检查类型是否已注册 */
  has(type: string): boolean {
    return this.agents.has(type);
  }

  /** Agent 类型名列表 */
  typeNames(): string[] {
    return [...this.agents.keys()];
  }

  /**
   * 生成 LLM tool description 中使用的 Agent 列表字符串。
   * 每行: `- {agentType}: {whenToUse} (Tools: {toolList})`
   */
  listForPrompt(): string {
    return this.getAll()
      .map((agent) => {
        const tools = agent.tools
          ? agent.tools.join(', ')
          : agent.disallowedTools
            ? `All except ${agent.disallowedTools.join(', ')}`
            : 'All';
        return `- ${agent.agentType}: ${agent.whenToUse} (Tools: ${tools})`;
      })
      .join('\n');
  }
}

/** 全局单例 */
export const agentRegistry = new AgentRegistry();
