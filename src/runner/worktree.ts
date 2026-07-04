// src/runner/worktree.ts

/**
 * 创建 git worktree 隔离环境。
 * Phase 1 骨架。Phase 2 实现实际 git worktree 操作。
 */
export async function createWorktree(_cwd: string, _label: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
  throw new Error('Worktree isolation not yet implemented');
}
