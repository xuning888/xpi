// src/runner/progress-streamer.ts
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import {ExtensionAPI} from "@earendil-works/pi-coding-agent";


/**
 * 实时进度流式输出器。
 * 订阅子 Agent 的事件，将工具调用进度注入到父 Agent 的对话中。
 */
export class ProgressStreamer {
  private agentName: string;
  private pi: ExtensionAPI;
  private turnCount = 0;
  private enabled = true;

  constructor(agentName: string, pi: ExtensionAPI) {
    this.agentName = agentName;
    this.pi = pi;
  }

  /** 处理 Agent 生命周期事件 */
  onAgentEvent(event: AgentEvent): void {
    if (!this.enabled) return;

    const eventType = event.type;

    switch (event.type) {
      case 'turn_start':
        this.turnCount++;
        break;

      case 'tool_execution_start':
        console.log(event);
        break;

      case 'tool_execution_end':
        console.log(event);
        break;
    }
  }

  /** 停止流式输出 */
  stop(): void {
    this.enabled = false;
  }
}
