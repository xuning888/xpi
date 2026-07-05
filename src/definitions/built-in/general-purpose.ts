// src/definitions/built-in/general-purpose.ts
import type { BuiltInAgentDefinition } from '../types.ts';

export const GENERAL_PURPOSE_AGENT: BuiltInAgentDefinition = {
  agentType: 'general-purpose',
  whenToUse:
    'General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. Use when you need to delegate work that requires file reading, editing, or shell commands.',
  tools: ['*'],
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
