// src/index.ts
import type {ExtensionAPI} from '@earendil-works/pi-coding-agent';
import {GENERAL_PURPOSE_AGENT} from './subagent/built-in/general-purpose.ts';
import {EXPLORE_AGENT} from './subagent/built-in/explore.ts';
import {PLAN_AGENT} from './subagent/built-in/plan.ts';
import {agentRegistry} from './subagent/definitions/registry.ts';
import {createAgentToolDefinition} from './subagent/tools/agent-tool.ts';
import {registerGuard, createDefaultGuardConfig} from './guard/index.ts';

export default function xpi(pi: ExtensionAPI): void {
    // 注册内置 Agent
    agentRegistry.register(GENERAL_PURPOSE_AGENT);
    agentRegistry.register(EXPLORE_AGENT);
    agentRegistry.register(PLAN_AGENT);

    // 每个内置 Agent 注册为独立工具
    pi.registerTool(createAgentToolDefinition('general-purpose'));
    pi.registerTool(createAgentToolDefinition('Explore'));
    pi.registerTool(createAgentToolDefinition( 'Plan'));

    // 注册门禁守卫
    registerGuard(pi, createDefaultGuardConfig());
}
