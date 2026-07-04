// src/runner/progress-streamer.ts
import type { AgentEvent } from '@earendil-works/pi-agent-core';

type SendMessageFn = (message: {
  customType: string;
  content: string;
  display: boolean;
  details?: unknown;
}) => void;

/**
 * 实时进度流式输出器。
 * 订阅子 Agent 的事件，将工具调用进度注入到父 Agent 的对话中。
 */
export class ProgressStreamer {
  private agentName: string;
  private sendMessage: SendMessageFn;
  private turnCount = 0;
  private enabled = true;

  constructor(agentName: string, sendMessage: SendMessageFn) {
    this.agentName = agentName;
    this.sendMessage = sendMessage;
  }

  /** 处理 Agent 生命周期事件 */
  onAgentEvent(event: AgentEvent): void {
    if (!this.enabled) return;

    switch (event.type) {
      case 'turn_start':
        this.turnCount++;
        break;

      case 'tool_execution_start':
        this.sendMessage({
          customType: 'subagent-progress',
          content: `🔧 ${this.agentName} · Turn ${this.turnCount} · ${event.toolName}`,
          display: true,
          details: { agentName: this.agentName, turn: this.turnCount, toolName: event.toolName },
        });
        break;

      case 'tool_execution_end':
        this.sendMessage({
          customType: 'subagent-progress',
          content: `✅ ${this.agentName} · ${event.toolName} · ${event.isError ? 'failed' : 'done'}`,
          display: true,
          details: { agentName: this.agentName, toolName: event.toolName, isError: event.isError },
        });
        break;
    }
  }

  /** 停止流式输出 */
  stop(): void {
    this.enabled = false;
  }
}
