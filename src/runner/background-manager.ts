// src/runner/background-manager.ts
import type { SubagentResult } from '../types.ts';

const CLEANUP_DELAY_MS = 300_000; // 5 minutes

interface BackgroundEntry {
  promise: Promise<SubagentResult>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

/**
 * 后台子代理任务管理器。
 */
export class BackgroundManager {
  private runs = new Map<string, BackgroundEntry>();

  /** 启动一个后台任务 */
  launch(id: string, promise: Promise<SubagentResult>): void {
    const entry: BackgroundEntry = { promise };
    promise.finally(() => {
      entry.cleanupTimer = setTimeout(() => {
        this.runs.delete(id);
      }, CLEANUP_DELAY_MS);
    });
    this.runs.set(id, entry);
  }

  /** 获取后台任务结果（undefined = 不存在或未完成） */
  async getResult(id: string): Promise<SubagentResult | undefined> {
    const entry = this.runs.get(id);
    if (!entry) return undefined;

    const settled = await Promise.race([
      entry.promise.then((r) => ({ done: true as const, result: r })),
      new Promise<{ done: false }>((resolve) => setTimeout(() => resolve({ done: false }), 0)),
    ]);

    return settled.done ? settled.result : undefined;
  }

  /** 活跃的后台任务数 */
  getActiveCount(): number {
    let count = 0;
    for (const entry of this.runs.values()) {
      // 检查是否还在 pending
      const isPending = !entry.cleanupTimer;
      if (isPending) count++;
    }
    return count;
  }
}

/** 全局单例 */
export const backgroundManager = new BackgroundManager();
