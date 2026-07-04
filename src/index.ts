/**
 * xpi - Pi Extension: Sub-agent System
 *
 * Adds cc-haha style sub-agent capabilities to Pi.
 * Provides:
 *   - agent tool: Spawn sub-agents with different types (general-purpose, Explore, Plan)
 *   - send_message tool: Inter-agent messaging via file mailbox (Phase 2)
 *   - team_create tool: Create and manage agent teams (Phase 2)
 *   - task_create / task_update / task_list tools: Shared task tracking (Phase 3)
 *
 * ## Usage
 *
 * Install in a Pi project by adding to .pi/extensions/ or
 * referencing in package.json pi.extensions field.
 *
 * Once loaded, the main agent can call the "agent" tool to
 * spawn sub-agents for complex independent tasks.
 */

import { writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createAgentToolDefinition } from "./agent-tool.ts";

/**
 * Extension entry point.
 *
 * Called by Pi's extension runner when the extension is loaded.
 * Registers all tools and event handlers.
 */
export default function xpi(pi: ExtensionAPI): void {
  // Debug: write a file to verify the extension loads
  writeFileSync("/tmp/xpi-loaded.txt", `xpi extension loaded at ${new Date().toISOString()}\n`);

  // =========================================================================
  // Phase 1: Core Agent Tool
  // =========================================================================
  try {
    const tool = createAgentToolDefinition();
    pi.registerTool(tool);
    writeFileSync("/tmp/xpi-tool-registered.txt", `Tool registered: ${tool.name}\n`);
  } catch (err) {
    writeFileSync("/tmp/xpi-error.txt", `Error registering agent tool: ${err}\n`);
  }

  // =========================================================================
  // Phase 2 (future): Communication + Team tools
  // =========================================================================
  // pi.registerTool(createSendMessageToolDefinition());
  // pi.registerTool(createTeamCreateToolDefinition());

  // =========================================================================
  // Phase 3 (future): Task system tools
  // =========================================================================
  // pi.registerTool(createTaskCreateToolDefinition());
  // pi.registerTool(createTaskUpdateToolDefinition());
  // pi.registerTool(createTaskListToolDefinition());

  // =========================================================================
  // Event handlers
  // =========================================================================

  // Track sub-agent lifecycle for logging/debugging
  pi.on("agent_start", (_event, _ctx) => {
    // Future: update team member status to "busy"
  });

  pi.on("agent_end", (_event, _ctx) => {
    // Future: check mailbox for pending messages
  });
}
