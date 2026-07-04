# xpi AgentDefinition 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 xpi 从硬编码三种 Agent 重构为通用 AgentDefinition 框架 + 实时进度流式

**Architecture:** 三层分离 — definitions/（类型+注册表）、runner/（执行+进度）、tools/（LLM工具注册）

**Tech Stack:** TypeScript, @earendil-works/pi-agent-core, @earendil-works/pi-coding-agent, typebox

## Global Constraints

- 所有代码在 `src/` 下，遵循 Pi Extension 规范
- 使用 `@earendil-works/pi-agent-core` 的 Agent 类和 `@earendil-works/pi-coding-agent` 的 ExtensionAPI
- 工具注册通过 `pi.registerTool()` 
- Model 字段暂为字符串（`'inherit'` 或完整 provider/model ID）
- TypeBox 用于 LLM tool schema 定义

## File Structure

```
xpi/src/
├── index.ts                          # MODIFY: Extension 入口
├── types.ts                          # MODIFY: 全局类型（AgentToolInput, SubagentResult 等）
│
├── definitions/                      # NEW DIR
│   ├── types.ts                      # NEW: AgentDefinition 类型
│   ├── built-in/
│   │   ├── general-purpose.ts        # NEW: GENERAL_PURPOSE_AGENT
│   │   ├── explore.ts               # NEW: EXPLORE_AGENT
│   │   └── plan.ts                  # NEW: PLAN_AGENT
│   ├── registry.ts                   # NEW: AgentRegistry 类
│   └── markdown-loader.ts           # NEW: 接口骨架
│
├── runner/                           # NEW DIR
│   ├── subagent-runner.ts           # NEW: 重写，使用 AgentDefinition + 进度流式
│   ├── progress-streamer.ts         # NEW: subscribe → sendMessage
│   ├── background-manager.ts        # NEW: 后台任务管理
│   └── worktree.ts                  # NEW: 接口骨架
│
├── tools/                            # NEW DIR
│   └── agent-tool.ts                # NEW: 重写，对接 AgentRegistry
│
└── agent-types.ts                    # DELETE: 内容迁移到 definitions/
    agent-tool.ts                     # DELETE: 内容迁移到 tools/
    subagent-runner.ts                # DELETE: 内容迁移到 runner/
```

---

### Task 1: 创建 definitions/types.ts — AgentDefinition 类型

**Files:**
- Create: `src/definitions/types.ts`

**Interfaces:**
- Produces: `BaseAgentDefinition`, `BuiltInAgentDefinition`, `CustomAgentDefinition`, `AgentDefinition`, `EffortLevel`, `PermissionMode`

- [ ] **Step 1: 创建 definitions 目录**

```bash
mkdir -p src/definitions/built-in
```

- [ ] **Step 2: 写入 AgentDefinition 类型定义**

```typescript
// src/definitions/types.ts

/** 思考深度 */
export type EffortLevel = 'minimal' | 'low' | 'medium' | 'high';

/** 权限模式 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';

/** Agent 来源 */
export type AgentSource = 'built-in' | 'user' | 'project' | 'plugin';

/** 所有 Agent 共有的基础字段 */
export interface BaseAgentDefinition {
  agentType: string;
  whenToUse: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: string; // 'inherit' | 'anthropic/claude-haiku-4-5' | ...
  getSystemPrompt: () => string;
}

/** 内置 Agent */
export interface BuiltInAgentDefinition extends BaseAgentDefinition {
  source: 'built-in';
  effort?: EffortLevel;
  maxTurns?: number;
  permissionMode?: PermissionMode;
  isolation?: 'worktree';
  background?: boolean;
  memory?: 'user' | 'project';
}

/** 自定义 Agent（Markdown 或 JSON 文件定义） */
export interface CustomAgentDefinition extends BaseAgentDefinition {
  source: 'user' | 'project';
  filename: string;
  baseDir: string;
  effort?: EffortLevel;
  maxTurns?: number;
  permissionMode?: PermissionMode;
  isolation?: 'worktree';
  background?: boolean;
  memory?: 'user' | 'project';
}

/** 所有 Agent 类型的联合 */
export type AgentDefinition = BuiltInAgentDefinition | CustomAgentDefinition;
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && npx tsc --noEmit src/definitions/types.ts 2>&1
```

- [ ] **Step 4: Commit**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && git add src/definitions/types.ts && git commit -m "feat: add AgentDefinition types"
```

---

### Task 2: 实现 definitions/built-in/ — 三个内置 Agent

**Files:**
- Create: `src/definitions/built-in/general-purpose.ts`
- Create: `src/definitions/built-in/explore.ts`
- Create: `src/definitions/built-in/plan.ts`

**Interfaces:**
- Consumes: `BuiltInAgentDefinition` from `../types.ts`
- Produces: `GENERAL_PURPOSE_AGENT`, `EXPLORE_AGENT`, `PLAN_AGENT` (named exports)

- [ ] **Step 1: 创建 general-purpose.ts**

```typescript
// src/definitions/built-in/general-purpose.ts
import type { BuiltInAgentDefinition } from '../types.ts';

export const GENERAL_PURPOSE_AGENT: BuiltInAgentDefinition = {
  agentType: 'general-purpose',
  whenToUse:
    'General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. Use when you need to delegate work that requires file reading, editing, or shell commands.',
  tools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'],
  disallowedTools: ['agent'],
  model: 'inherit',
  source: 'built-in',
  getSystemPrompt: () => `You are a sub-agent dispatched to complete a specific task.
Work autonomously and efficiently. Focus only on the assigned task.
When you complete the task, provide a clear summary of what you did and what you found.
Do not spawn additional sub-agents.

Your strengths:
- Reading and editing files
- Running shell commands to explore and build
- Multi-step research and implementation tasks

Guidelines:
- Work step by step
- Be thorough and precise
- When finished, summarize your findings clearly`,
};
```

- [ ] **Step 2: 创建 explore.ts**

```typescript
// src/definitions/built-in/explore.ts
import type { BuiltInAgentDefinition } from '../types.ts';

export const EXPLORE_AGENT: BuiltInAgentDefinition = {
  agentType: 'Explore',
  whenToUse:
    'Fast agent specialized for exploring codebases. Use when you need to quickly find files by patterns, search code for keywords, or answer questions about the codebase. Specify thoroughness: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis.',
  tools: ['read', 'grep', 'find', 'ls', 'bash'],
  disallowedTools: ['agent', 'edit', 'write'],
  model: 'inherit',
  source: 'built-in',
  getSystemPrompt: () => `You are a read-only exploration sub-agent.

=== CRITICAL: READ-ONLY MODE ===
You are STRICTLY PROHIBITED from:
- Creating or modifying files
- Deleting or moving files
- Running destructive shell commands

Your role is EXCLUSIVELY to search and analyze existing code.

Your strengths:
- Rapidly finding files using glob patterns (find tool)
- Searching code with regex (grep tool)
- Reading and analyzing file contents
- Listing directory structures

Guidelines:
- Use find for broad file pattern matching
- Use grep for searching file contents
- Use read when you know the specific file path
- Use bash only for read-only operations (ls, git log, git diff, cat, head, tail)
- Never use bash for: mkdir, rm, git add, git commit, npm install
- Make efficient use of tools — prefer parallel calls when possible
- Adapt search thoroughness based on the task

Complete the search request efficiently and report your findings clearly.`,
};
```

- [ ] **Step 3: 创建 plan.ts**

```typescript
// src/definitions/built-in/plan.ts
import type { BuiltInAgentDefinition } from '../types.ts';

export const PLAN_AGENT: BuiltInAgentDefinition = {
  agentType: 'Plan',
  whenToUse:
    'Software architect agent for designing implementation plans. Use when you need to plan the implementation strategy for a task. Returns step-by-step plans, identifies critical files, and considers architectural trade-offs.',
  tools: ['read', 'grep', 'find', 'ls', 'bash'],
  disallowedTools: ['agent', 'edit', 'write'],
  model: 'inherit',
  source: 'built-in',
  getSystemPrompt: () => `You are a planning sub-agent.

=== CRITICAL: READ-ONLY MODE ===
You CAN read files, search code, and run read-only shell commands.
You CANNOT modify any files or run destructive commands.

## Your Process

1. **Understand Requirements**: Focus on the requirements provided.

2. **Explore Thoroughly**:
   - Read relevant files
   - Find existing patterns using find, grep, and ls
   - Understand the current architecture
   - Identify similar features as reference

3. **Design Solution**:
   - Create implementation approach
   - Consider trade-offs and architectural decisions
   - Follow existing patterns where appropriate

4. **Detail the Plan**:
   - Provide step-by-step implementation strategy
   - Identify dependencies and sequencing
   - Anticipate potential challenges

## Required Output

End your response with:

### Critical Files for Implementation
List 3-5 files most critical for implementing this plan.

REMEMBER: You can ONLY explore and plan. You CANNOT write or modify files.`,
};
```

- [ ] **Step 4: Commit**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && git add src/definitions/built-in/ && git commit -m "feat: add built-in agent definitions (general-purpose, Explore, Plan)"
```

---

### Task 3: 实现 definitions/registry.ts

**Files:**
- Create: `src/definitions/registry.ts`

**Interfaces:**
- Consumes: `AgentDefinition` from `./types.ts`
- Produces: `AgentRegistry` class with `register`, `get`, `getAll`, `getActive`, `listForPrompt` methods

- [ ] **Step 1: 实现 AgentRegistry**

```typescript
// src/definitions/registry.ts
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && git add src/definitions/registry.ts && git commit -m "feat: add AgentRegistry"
```

---

### Task 4: 创建 definitions/markdown-loader.ts 骨架

**Files:**
- Create: `src/definitions/markdown-loader.ts`

**Interfaces:**
- Produces: `loadMarkdownAgents()` → 当前返回空数组 `[]`

- [ ] **Step 1: 写入骨架**

```typescript
// src/definitions/markdown-loader.ts
import type { CustomAgentDefinition } from './types.ts';

/**
 * 从 .pi/agents/*.md 加载自定义 Agent 定义。
 * Phase 1 骨架：返回空数组。Phase 2 实现 YAML frontmatter 解析。
 */
export function loadMarkdownAgents(_cwd: string, _agentDir: string): CustomAgentDefinition[] {
  return [];
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && git add src/definitions/markdown-loader.ts && git commit -m "feat: add markdown-loader skeleton"
```

---

### Task 5: 重写 types.ts — 精简为全局类型

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Produces: `SubagentType`, `SubagentOptions`, `SubagentTraceStep`, `SubagentResult`, `AgentToolInput`, `Team`, `Task`, `TaskStatus`, `MailboxMessage`
- Consumes: nothing new

- [ ] **Step 1: 重写 types.ts（移除 AgentTypeConfig 等已迁移到 definitions/ 的类型）**

```typescript
// src/types.ts
// 全局类型定义。AgentDefinition 相关类型在 definitions/types.ts。

/** 子代理类型标识 */
export type SubagentType = 'general-purpose' | 'Explore' | 'Plan';

/** 子代理运行选项 */
export interface SubagentOptions {
  description: string;
  prompt: string;
  type: string;
  cwd: string;
  runInBackground?: boolean;
  apiKey?: string;
  name?: string;
  teamName?: string;
}

/** 子代理工作步骤（用于 trace 展示） */
export interface SubagentTraceStep {
  turn: number;
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  text: string;
  tokens: number;
}

/** 子代理运行结果 */
export interface SubagentResult {
  output: string;
  messages: unknown[];
  aborted: boolean;
  error?: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
  };
  trace?: SubagentTraceStep[];
}

/** Agent tool 的 TypeBox 验证后的输入 */
export interface AgentToolInput {
  description: string;
  prompt: string;
  subagent_type?: string;
  model?: string;
  run_in_background?: boolean;
}

// ============================================================================
// Phase 2/3 预备类型
// ============================================================================

export interface Team {
  name: string;
  description?: string;
  createdAt: string;
  members: string[];
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  owner?: string;
  blockedBy: string[];
  blocks: string[];
  createdAt: string;
  completedAt?: string;
  teamName: string;
}

export interface MailboxMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  read: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && git add src/types.ts && git commit -m "refactor: simplify types.ts, move AgentDefinition to definitions/"
```

---

### Task 6: 实现 runner/progress-streamer.ts

**Files:**
- Create: `src/runner/progress-streamer.ts`

**Interfaces:**
- Consumes: Pi ExtensionAPI (sendMessage)
- Produces: `ProgressStreamer` class with `start`, `stop`, `onAgentEvent` methods

- [ ] **Step 1: 实现 ProgressStreamer**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && git add src/runner/progress-streamer.ts && git commit -m "feat: add ProgressStreamer for real-time sub-agent visibility"
```

---

### Task 7: 实现 runner/background-manager.ts

**Files:**
- Create: `src/runner/background-manager.ts`

**Interfaces:**
- Produces: `BackgroundManager` class — `launch(id, promise)`, `get(id)`, `getActiveCount()`

- [ ] **Step 1: 实现 BackgroundManager**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && git add src/runner/background-manager.ts && git commit -m "feat: add BackgroundManager"
```

---

### Task 8: 创建 runner/worktree.ts 骨架

**Files:**
- Create: `src/runner/worktree.ts`

- [ ] **Step 1: 骨架**

```typescript
// src/runner/worktree.ts

/**
 * 创建 git worktree 隔离环境。
 * Phase 1 骨架。Phase 2 实现实际 git worktree 操作。
 */
export async function createWorktree(_cwd: string, _label: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
  throw new Error('Worktree isolation not yet implemented');
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && git add src/runner/worktree.ts && git commit -m "feat: add worktree skeleton"
```

---

### Task 9: 重写 runner/subagent-runner.ts

**Files:**
- Create: `src/runner/subagent-runner.ts` (覆盖旧文件在新目录)

**Interfaces:**
- Consumes: `AgentDefinition` from `definitions/types`, `AgentRegistry` from `definitions/registry`, `SubagentOptions`, `SubagentResult` from `types`, `ProgressStreamer` from `progress-streamer`, `BackgroundManager` from `background-manager`
- Produces: `runSubagent()`, `runSubagentBackground()`, `getBackgroundRunResult()`, `getActiveBackgroundRunCount()`

- [ ] **Step 1: 实现核心函数**

```typescript
// src/runner/subagent-runner.ts
import { Agent, type AgentMessage, type AgentEvent } from '@earendil-works/pi-agent-core';
import { type AssistantMessage, type Model, streamSimple } from '@earendil-works/pi-ai/compat';
import { createCodingTools, createReadOnlyTools } from '@earendil-works/pi-coding-agent';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { agentRegistry } from '../definitions/registry.ts';
import type { AgentDefinition } from '../definitions/types.ts';
import type { SubagentOptions, SubagentResult, SubagentTraceStep } from '../types.ts';
import { ProgressStreamer } from './progress-streamer.ts';
import { backgroundManager } from './background-manager.ts';

// ============================================================================
// Helpers
// ============================================================================

function isAssistantMessage(msg: AgentMessage): msg is AssistantMessage {
  return msg.role === 'assistant';
}

function extractTextContent(message: AssistantMessage): string {
  if (!message.content || !Array.isArray(message.content)) return '';
  return message.content
    .filter((c) => c.type === 'text')
    .map((c) => ('text' in c ? c.text : ''))
    .join('\n');
}

function sumUsage(messages: AgentMessage[]): SubagentResult['usage'] {
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0, totalTokens = 0;
  for (const msg of messages) {
    if (isAssistantMessage(msg) && msg.usage) {
      input += msg.usage.input || 0;
      output += msg.usage.output || 0;
      cacheRead += msg.usage.cacheRead || 0;
      cacheWrite += msg.usage.cacheWrite || 0;
      totalTokens += msg.usage.totalTokens || 0;
    }
  }
  return { input, output, cacheRead, cacheWrite, totalTokens };
}

function extractAgentError(messages: AgentMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (isAssistantMessage(msg) && msg.stopReason === 'error' && msg.errorMessage) {
      return msg.errorMessage;
    }
  }
  return undefined;
}

// ============================================================================
// Tool Resolution
// ============================================================================

const ALL_TOOLS: Record<string, (cwd: string) => AgentTool[]> = {
  read: (cwd: string) => createReadOnlyTools(cwd).filter((t) => t.name === 'read'),
  bash: (cwd: string) => createCodingTools(cwd).filter((t) => t.name === 'bash'),
  edit: (cwd: string) => createCodingTools(cwd).filter((t) => t.name === 'edit'),
  write: (cwd: string) => createCodingTools(cwd).filter((t) => t.name === 'write'),
  grep: (cwd: string) => createReadOnlyTools(cwd).filter((t) => t.name === 'grep'),
  find: (cwd: string) => createReadOnlyTools(cwd).filter((t) => t.name === 'find'),
  ls: (cwd: string) => createReadOnlyTools(cwd).filter((t) => t.name === 'ls'),
};

function resolveTools(agent: AgentDefinition, cwd: string): AgentTool[] {
  const tools: AgentTool[] = [];

  if (agent.tools && agent.tools.length > 0) {
    // 白名单模式
    const denySet = new Set(agent.disallowedTools ?? []);
    for (const toolName of agent.tools) {
      if (denySet.has(toolName)) continue;
      const factory = ALL_TOOLS[toolName];
      if (factory) {
        tools.push(...factory(cwd));
      }
    }
  } else if (agent.disallowedTools && agent.disallowedTools.length > 0) {
    // 黑名单模式
    const denySet = new Set(agent.disallowedTools);
    for (const toolName of Object.keys(ALL_TOOLS)) {
      if (denySet.has(toolName)) continue;
      const factory = ALL_TOOLS[toolName];
      if (factory) {
        tools.push(...factory(cwd));
      }
    }
  } else {
    // 默认：所有编码工具
    tools.push(...createCodingTools(cwd));
  }

  return tools;
}

// ============================================================================
// Sub-agent Runner
// ============================================================================

export async function runSubagent(
  agentDef: AgentDefinition,
  options: SubagentOptions & { model: Model<any>; apiKey?: string },
  sendMessage?: (msg: { customType: string; content: string; display: boolean; details?: unknown }) => void,
): Promise<SubagentResult> {
  const systemPrompt = agentDef.getSystemPrompt();
  const tools = resolveTools(agentDef, options.cwd);

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: options.model,
      thinkingLevel: 'medium',
      tools,
    },
    streamFn: streamSimple,
    sessionId: `xpi-${agentDef.agentType}-${Date.now()}`,
    toolExecution: 'parallel',
    getApiKey: options.apiKey ? async () => options.apiKey : undefined,
    maxRetryDelayMs: 30_000,
  });

  // 实时进度流式
  const streamer = sendMessage ? new ProgressStreamer(agentDef.agentType, sendMessage) : null;
  const unsubscribe = streamer
    ? agent.subscribe((event, _signal) => {
        streamer.onAgentEvent(event);
      })
    : () => {};

  let aborted = false;
  let errorMessage: string | undefined;

  try {
    await agent.prompt(options.prompt);
    await agent.waitForIdle();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('abort') || message.includes('Abort')) {
      aborted = true;
    } else {
      errorMessage = message;
    }
  }

  unsubscribe();
  streamer?.stop();

  const messages = agent.state.messages;
  const usage = sumUsage(messages);

  if (!errorMessage && !aborted) {
    errorMessage = extractAgentError(messages);
  }

  // 构建 trace
  const trace: SubagentTraceStep[] = [];
  let turnIndex = 0;
  const outputParts: string[] = [];

  for (const msg of messages) {
    if (isAssistantMessage(msg)) {
      turnIndex++;
      const text = extractTextContent(msg);
      const toolCalls = msg.content
        .filter(
          (c): c is { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> } =>
            c.type === 'toolCall',
        )
        .map((tc) => ({ name: tc.name, arguments: tc.arguments }));

      trace.push({ turn: turnIndex, toolCalls, text: text.slice(0, 500), tokens: msg.usage?.totalTokens ?? 0 });
      if (text) outputParts.push(text);
    }
  }

  agent.reset();

  return {
    output: outputParts.join('\n\n') || `(${agentDef.agentType} produced no output)`,
    messages: [...messages],
    aborted,
    error: errorMessage,
    usage,
    trace: trace.length > 0 ? trace : undefined,
  };
}

export function runSubagentBackground(
  agentDef: AgentDefinition,
  options: SubagentOptions & { model: Model<any>; apiKey?: string },
  sendMessage?: (msg: { customType: string; content: string; display: boolean; details?: unknown }) => void,
): string {
  const runId = `bg-${agentDef.agentType}-${Date.now()}`;
  const promise = runSubagent(agentDef, options, sendMessage);
  backgroundManager.launch(runId, promise);
  return runId;
}

export const getBackgroundRunResult = (id: string) => backgroundManager.getResult(id);
export const getActiveBackgroundRunCount = () => backgroundManager.getActiveCount();
```

- [ ] **Step 2: Commit**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && git add src/runner/subagent-runner.ts && git commit -m "feat: rewrite subagent-runner with AgentDefinition + progress streaming"
```

---

### Task 10: 重写 tools/agent-tool.ts

**Files:**
- Create: `src/tools/agent-tool.ts`

**Interfaces:**
- Consumes: `AgentRegistry` from `definitions/registry`, `runSubagent`, `runSubagentBackground` from `runner/subagent-runner`
- Produces: `createAgentToolDefinition()` → `ToolDefinition`

- [ ] **Step 1: 实现工具定义**

```typescript
// src/tools/agent-tool.ts
import { Type } from 'typebox';
import type { Static } from 'typebox';
import type { Model } from '@earendil-works/pi-ai/compat';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { agentRegistry } from '../definitions/registry.ts';
import { runSubagent, runSubagentBackground } from '../runner/subagent-runner.ts';
import type { SubagentOptions } from '../types.ts';

const agentToolSchema = Type.Object({
  description: Type.String({ description: 'A short (3-5 word) description of the task for the sub-agent' }),
  prompt: Type.String({ description: 'The task for the sub-agent to perform. Be specific and detailed.' }),
  subagent_type: Type.Optional(
    Type.String({
      description: `The type of sub-agent to use. Available: ${agentRegistry.typeNames().join(', ')}. Defaults to "general-purpose".`,
      default: 'general-purpose',
    }),
  ),
  model: Type.Optional(
    Type.String({ description: 'Optional model override. If omitted, inherits parent model.' }),
  ),
  run_in_background: Type.Optional(
    Type.Boolean({ description: 'Run asynchronously without waiting.', default: false }),
  ),
});

function buildAgentListDescription(): string {
  return agentRegistry.listForPrompt();
}

export function createAgentToolDefinition(): ToolDefinition<typeof agentToolSchema, unknown> {
  return defineTool({
    name: 'agent',
    label: 'Agent (Sub-agent)',
    description: `Launch a new agent to handle complex, multi-step tasks autonomously. Each agent type has specific capabilities and tools available to it. Specify a subagent_type to select which agent type to use. If omitted, the general-purpose agent is used.

Available agent types and the tools they have access to:
${buildAgentListDescription()}

When NOT to use the agent tool:
- If you want to read a specific file path, use the read tool instead
- If you are searching for a specific class or keyword, use grep instead
- Simple single-step operations

Usage notes:
- Always include a short description (3-5 words)
- Sub-agents cannot spawn additional sub-agents
- Choose the right agent type: Explore/Plan for read-only, general-purpose for coding
- Sub-agents work independently and return a summary when done`,
    promptSnippet: 'Launch sub-agents for complex tasks (research, exploration, planning, coding)',
    promptGuidelines: [
      'Use the agent tool for complex multi-step tasks that benefit from focused independent execution',
      `Choose the appropriate sub-agent type: ${agentRegistry.typeNames().join(', ')}`,
      'Sub-agents cannot spawn additional sub-agents, so give them complete tasks',
      'Sub-agents work independently and return a summary when done — do not micromanage',
    ],
    parameters: agentToolSchema,
    renderShell: 'default',

    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      const input = params as Static<typeof agentToolSchema>;
      const agentType = input.subagent_type ?? 'general-purpose';
      const agentDef = agentRegistry.get(agentType);

      if (!agentDef) {
        return {
          content: [{ type: 'text', text: `Unknown agent type: ${agentType}. Available: ${agentRegistry.typeNames().join(', ')}` }],
          details: {},
        };
      }

      if (!ctx.model) {
        return {
          content: [{ type: 'text', text: 'Error: No model is active. Select a model first.' }],
          details: {},
        };
      }

      let apiKey: string | undefined;
      try {
        const authResult = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model as Model<any>);
        if (authResult.ok) apiKey = authResult.apiKey;
      } catch { /* env fallback */ }

      const sendMessage = (msg: { customType: string; content: string; display: boolean; details?: unknown }) => {
        try {
          (ctx as any).sendMessage?.(msg);
        } catch { /* silent — progress messages are best-effort */ }
      };

      const subagentOptions: SubagentOptions = {
        description: input.description,
        prompt: input.prompt,
        type: agentType,
        cwd: ctx.cwd,
        apiKey,
        runInBackground: input.run_in_background ?? false,
      };

      if (input.run_in_background) {
        const runId = runSubagentBackground(agentDef, { ...subagentOptions, model: ctx.model as Model<any> }, sendMessage);
        return {
          content: [{ type: 'text', text: `Sub-agent launched in background.\nRun ID: \`${runId}\`\nType: ${agentType}\nDescription: ${input.description}` }],
          details: { runId, type: agentType, background: true },
        };
      }

      if (signal?.aborted) {
        return { content: [{ type: 'text', text: 'Aborted.' }], details: { aborted: true } };
      }

      const result = await runSubagent(agentDef, { ...subagentOptions, model: ctx.model as Model<any> }, sendMessage);

      if (result.aborted) {
        return { content: [{ type: 'text', text: 'Sub-agent aborted.' }], details: { aborted: true } };
      }

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Sub-agent error: ${result.error}\n\nPartial output:\n${result.output}` }],
          details: { error: result.error, usage: result.usage },
        };
      }

      const outputText = [
        `## Sub-agent Result (${agentType})`,
        `**Task**: ${input.description}`,
        `**Usage**: ${result.usage.totalTokens.toLocaleString()} tokens (in: ${result.usage.input}, out: ${result.usage.output})`,
        '',
        '---',
        '',
        result.output,
      ].join('\n');

      return {
        content: [{ type: 'text', text: outputText }],
        details: { type: agentType, usage: result.usage, messageCount: result.messages.length },
      };
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && git add src/tools/agent-tool.ts && git commit -m "feat: rewrite agent-tool with AgentRegistry integration"
```

---

### Task 11: 更新 index.ts + 清理旧文件

**Files:**
- Modify: `src/index.ts`
- Delete: `src/agent-types.ts`, `src/agent-tool.ts`, `src/subagent-runner.ts`（根目录旧文件）

- [ ] **Step 1: 更新 index.ts**

```typescript
// src/index.ts
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { Model } from '@earendil-works/pi-ai/compat';
import { GENERAL_PURPOSE_AGENT } from './definitions/built-in/general-purpose.ts';
import { EXPLORE_AGENT } from './definitions/built-in/explore.ts';
import { PLAN_AGENT } from './definitions/built-in/plan.ts';
import { agentRegistry } from './definitions/registry.ts';
import { loadMarkdownAgents } from './definitions/markdown-loader.ts';
import { runSubagent } from './runner/subagent-runner.ts';
import { createAgentToolDefinition } from './tools/agent-tool.ts';

export default function xpi(pi: ExtensionAPI): void {
  // 注册内置 Agent
  agentRegistry.register(GENERAL_PURPOSE_AGENT);
  agentRegistry.register(EXPLORE_AGENT);
  agentRegistry.register(PLAN_AGENT);

  // 注册工具
  pi.registerTool(createAgentToolDefinition());

  // /agent 命令（交互模式）
  pi.registerCommand('agent', {
    description: 'Launch a sub-agent (Explore | Plan | general-purpose)',
    handler: async (args, ctx) => {
      if (!args?.trim()) {
        ctx.ui.notify('Usage: /agent <type> <description>', 'error');
        ctx.ui.notify('Types: ' + agentRegistry.typeNames().join(' | '), 'info');
        return;
      }
      const parts = args.trim().split(/\s+/);
      const type = parts[0];
      const description = parts.slice(1).join(' ');

      if (!agentRegistry.has(type)) {
        ctx.ui.notify(`Unknown type "${type}". Available: ${agentRegistry.typeNames().join(' | ')}`, 'error');
        return;
      }
      if (!description) { ctx.ui.notify('Please provide a task description', 'error'); return; }
      if (!ctx.model) { ctx.ui.notify('No model active', 'error'); return; }

      let apiKey: string | undefined;
      try {
        const authResult = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model as Model<any>);
        if (authResult.ok) apiKey = authResult.apiKey;
      } catch { /* env fallback */ }

      ctx.ui.notify(`Launching ${type} sub-agent: ${description}...`, 'info');
      const agentDef = agentRegistry.get(type)!;
      const result = await runSubagent(agentDef, {
        description, prompt: description, type, cwd: ctx.cwd, apiKey,
        model: ctx.model as Model<any>,
      });

      if (result.error) {
        ctx.ui.notify(`Failed: ${result.error}`, 'error');
        if (result.output) ctx.ui.notify(result.output.slice(0, 500), 'info');
        return;
      }

      if (result.trace) {
        for (const step of result.trace) {
          const tools = step.toolCalls.length > 0 ? step.toolCalls.map((tc) => tc.name).join(', ') : 'thinking';
          ctx.ui.notify(`  Turn ${step.turn} (${step.tokens.toLocaleString()}t) ${tools}`, 'info');
        }
      }
      ctx.ui.notify(`Done · ${result.usage.totalTokens.toLocaleString()} tokens`, 'info');
      ctx.ui.notify(result.output.slice(0, 2000), 'info');
    },
  });

  // Phase 2 hook
  // const customAgents = loadMarkdownAgents(ctx.cwd, '');
  // for (const agent of customAgents) agentRegistry.register(agent);
}
```

- [ ] **Step 2: 删除旧文件**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && rm src/agent-types.ts src/agent-tool.ts src/subagent-runner.ts
```

- [ ] **Step 3: Commit**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && git add -A && git commit -m "refactor: update index.ts for new architecture, remove old files"
```

---

### Task 12: 端到端测试

**Files:**
- 无新文件

- [ ] **Step 1: 启动 Pi 验证扩展加载**

```bash
cd /Users/xuning/VSCodeProjuects/xpi-test && npx @earendil-works/pi-coding-agent -p --tools agent "Reply with OK" 2>&1 | tail -3
```
Expected: "OK"

- [ ] **Step 2: 验证 agent tool 出现**

```bash
cd /Users/xuning/VSCodeProjuects/xpi-test && npx @earendil-works/pi-coding-agent -p --tools agent "What agent types do you have access to? List them." 2>&1 | tail -10
```
Expected: 列出 general-purpose, Explore, Plan

- [ ] **Step 3: 子代理端到端测试**

```bash
cd /Users/xuning/VSCodeProjuects/xpi-test && echo "test content" > /tmp/xpi-e2e.txt && npx @earendil-works/pi-coding-agent -p --tools agent --system-prompt "You MUST use the agent tool for any task." 'Use the agent tool with subagent_type=Explore, description="test", prompt="Read /tmp/xpi-e2e.txt and report its contents"' 2>&1 | tail -10
```
Expected: 包含 "test content"

- [ ] **Step 4: Commit (if changes needed)**

```bash
cd /Users/xuning/VSCodeProjuects/xpi && git add -A && git commit -m "test: verify end-to-end sub-agent flow"
```