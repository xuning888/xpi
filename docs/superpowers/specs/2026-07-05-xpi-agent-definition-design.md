# xpi AgentDefinition 框架设计

## 目标

将 xpi 从硬编码的三种 Agent 类型重构为通用的 `AgentDefinition` 框架，对齐 cc-haha 架构。核心改进：

1. AgentDefinition 抽象 — 内置、自定义 Agent 的统一接口
2. 实时进度流式 — 子代理工作过程对父 Agent 可见
3. 架构分层 — definitions / runner / tools 三层

## AgentDefinition 类型

```typescript
interface BaseAgentDefinition {
  agentType: string;          // 名称: "Explore", "Plan"
  whenToUse: string;          // LLM 选择判断依据
  tools?: string[];           // 工具白名单
  disallowedTools?: string[]; // 工具黑名单
  model?: string;             // 'inherit' | 'anthropic/claude-haiku-4-5'
  getSystemPrompt(): string;  // 动态系统提示
}

interface BuiltInAgentDefinition extends BaseAgentDefinition {
  source: 'built-in';
  effort?: EffortLevel;
  maxTurns?: number;
  permissionMode?: PermissionMode;
  isolation?: 'worktree';
  background?: boolean;
  memory?: 'user' | 'project';
}

interface CustomAgentDefinition extends BaseAgentDefinition {
  source: 'user' | 'project';
  filename: string;
  baseDir: string;
  // 同内置 Agent 的可选字段
}

type AgentDefinition = BuiltInAgentDefinition | CustomAgentDefinition;
```

## 加载优先级

```
built-in → plugin → project agents (.pi/agents/*.md)
同名覆盖：后者覆盖前者
```

## 内置 Agent

| 类型 | 工具 | 模型 |
|------|------|------|
| general-purpose | read, bash, edit, write | inherit |
| Explore | read, grep, find, ls | inherit |
| Plan | read, grep, find, ls | inherit |

## 自定义 Agent（Markdown）

格式：`.pi/agents/*.md`（YAML frontmatter + Markdown body）

```markdown
---
name: code-reviewer
description: 审查代码
tools: [read, grep, find, ls]
disallowedTools: [edit, write, agent]
model: inherit
maxTurns: 10
---

系统提示内容...
```

Phase 1 只定义接口，不实现加载。

## 实时进度流式

子代理执行时，通过 `Agent.subscribe()` 订阅事件，使用 `pi.sendMessage()` 注入进度消息：

```
agent.subscribe((event) => {
  tool_execution_start → sendMessage("🔧 {agentName} · Turn {n} · {toolName}")
  tool_execution_end   → sendMessage("✅ {toolName} 完成")
})
```

进度消息使用 `customType: 'subagent-progress'`，对 LLM 不可见。

## 目录结构

```
xpi/src/
├── index.ts                     # Extension 入口
├── types.ts                     # 所有类型
├── definitions/
│   ├── types.ts                 # AgentDefinition
│   ├── built-in/                # 3 个内置 Agent
│   ├── registry.ts              # 注册表
│   └── markdown-loader.ts      # Phase 2
├── runner/
│   ├── subagent-runner.ts       # 主执行器
│   ├── progress-streamer.ts     # 进度注入
│   ├── background-manager.ts    # 后台任务
│   └── worktree.ts              # Phase 2
├── tools/
│   └── agent-tool.ts            # AgentTool
└── mailbox.ts                   # Phase 2
```

## 实现顺序

### Phase 1a: 类型 + 定义层
1. 重写 `types.ts`
2. 实现 `definitions/built-in/`
3. 实现 `definitions/registry.ts`
4. `definitions/markdown-loader.ts` 接口骨架

### Phase 1b: 执行引擎
5. 重写 `runner/subagent-runner.ts`
6. 实现 `runner/progress-streamer.ts`
7. 实现 `runner/background-manager.ts`

### Phase 1c: 工具 + 入口
8. 重写 `tools/agent-tool.ts`
9. 更新 `index.ts`
10. 端到端测试

## 不实现（本 Phase）

- Markdown 自定义 Agent 加载
- Worktree 隔离
- Team / Task / Mailbox（Phase 2/3）
- Model 别名映射