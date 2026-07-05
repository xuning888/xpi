// src/index.ts
import type {ExtensionAPI} from '@earendil-works/pi-coding-agent';
import {GENERAL_PURPOSE_AGENT} from './definitions/built-in/general-purpose.ts';
import {EXPLORE_AGENT} from './definitions/built-in/explore.ts';
import {PLAN_AGENT} from './definitions/built-in/plan.ts';
import {agentRegistry} from './definitions/registry.ts';
import {createAgentToolDefinition} from './tools/agent-tool.ts';

export default function xpi(pi: ExtensionAPI): void {
    // 注册内置 Agent
    agentRegistry.register(GENERAL_PURPOSE_AGENT);
    agentRegistry.register(EXPLORE_AGENT);
    agentRegistry.register(PLAN_AGENT);

    // 注册工具
    pi.registerTool(createAgentToolDefinition(pi));


}
