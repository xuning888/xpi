/**
 * xpi - Sub-agent runner
 *
 * Creates and executes sub-agents using Pi's Agent class directly.
 * Each sub-agent gets its own Agent instance with a tailored tool set
 * and system prompt. Communication with the parent happens via
 * the tool result return value.
 */

import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import {
  type AssistantMessage,
  type Model,
  streamSimple,
} from "@earendil-works/pi-ai/compat";
import { getAgentTypeConfig } from "./agent-types.ts";
import type { SubagentOptions, SubagentResult, SubagentTraceStep } from "./types.ts";

// ============================================================================
// Helpers
// ============================================================================

function isAssistantMessage(msg: AgentMessage): msg is AssistantMessage {
  return msg.role === "assistant";
}

/** Extract text content from an assistant message. */
function extractTextContent(message: AssistantMessage): string {
  if (!message.content || !Array.isArray(message.content)) return "";
  return message.content
    .filter((c) => c.type === "text")
    .map((c) => ("text" in c ? c.text : ""))
    .join("\n");
}

/** Estimate total token usage from assistant messages. */
function sumUsage(messages: AgentMessage[]): SubagentResult["usage"] {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let totalTokens = 0;

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

/** Extract error from the last assistant message if it has stopReason "error". */
function extractAgentError(messages: AgentMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (isAssistantMessage(msg) && msg.stopReason === "error" && msg.errorMessage) {
      return msg.errorMessage;
    }
  }
  return undefined;
}

// ============================================================================
// Sub-agent Runner
// ============================================================================

/** Active background sub-agent tasks. Keyed by a unique run ID. */
const backgroundRuns = new Map<string, Promise<SubagentResult>>();

let nextRunId = 0;

/**
 * Run a sub-agent and return its result.
 *
 * Creates a fresh Agent instance with the configured tool set and system prompt,
 * executes the task prompt, and collects the output.
 */
export async function runSubagent(
  options: SubagentOptions & { model: Model<any>; apiKey?: string },
): Promise<SubagentResult> {
  const config = getAgentTypeConfig(options.type);
  const tools = config.createTools(options.cwd);
  const systemPrompt = `${config.systemPromptPrefix}

## Task

${options.description}

## Instructions

${options.prompt}

## Important

- Work step by step
- Be thorough and precise
- When finished, summarize your findings clearly
- Do NOT call the "agent" tool to spawn additional sub-agents`;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: options.model,
      thinkingLevel: "medium",
      tools,
    },
    streamFn: streamSimple,
    sessionId: `xpi-subagent-${options.type}-${Date.now()}`,
    toolExecution: "parallel",
    getApiKey: options.apiKey
      ? async () => options.apiKey
      : undefined,
  });



  let aborted = false;
  let errorMessage: string | undefined;

  try {
    await agent.prompt(options.prompt);
    await agent.waitForIdle();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("abort") || message.includes("Abort")) {
      aborted = true;
    } else {
      errorMessage = message;
    }
  }

  // Collect results and build trace from messages
  const messages = agent.state.messages;
  const usage = sumUsage(messages);

  // Check for errors that were handled internally by the Agent (not thrown)
  if (!errorMessage && !aborted) {
    errorMessage = extractAgentError(messages);
  }

  // Build work trace from assistant messages
  const trace: SubagentTraceStep[] = [];
  let turnIndex = 0;
  const outputParts: string[] = [];
  for (const msg of messages) {
    if (isAssistantMessage(msg)) {
      turnIndex++;
      const text = extractTextContent(msg);
      const toolCalls = msg.content
        .filter((c): c is { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> } =>
          c.type === "toolCall",
        )
        .map((tc) => ({ name: tc.name, arguments: tc.arguments }));

      trace.push({
        turn: turnIndex,
        toolCalls,
        text: text.slice(0, 500),
        tokens: msg.usage?.totalTokens ?? 0,
      });

      if (text) {
        outputParts.push(text);
      }
    }
  }

  agent.reset();

  return {
    output: outputParts.join("\n\n") || "(sub-agent produced no output)",
    messages: [...messages],
    aborted,
    error: errorMessage,
    usage,
    trace: trace.length > 0 ? trace : undefined,
  };
}

/**
 * Launch a sub-agent in the background.
 *
 * Returns a run ID immediately. The result can be retrieved later
 * via `getBackgroundRunResult()`.
 */
export function runSubagentBackground(
  options: SubagentOptions & { model: Model<any>; apiKey?: string },
): string {
  const runId = `bg-${++nextRunId}-${Date.now()}`;
  const promise = runSubagent(options);
  backgroundRuns.set(runId, promise);

  // Clean up after completion
  promise.finally(() => {
    // Keep result available for a short time after completion
    setTimeout(() => {
      backgroundRuns.delete(runId);
    }, 300_000); // 5 minutes
  });

  return runId;
}

/**
 * Check if a background run has completed and get its result.
 * Returns undefined if the run is still in progress or doesn't exist.
 */
export async function getBackgroundRunResult(
  runId: string,
): Promise<SubagentResult | undefined> {
  const promise = backgroundRuns.get(runId);
  if (!promise) return undefined;

  // Check if already settled
  const settled = await Promise.race([
    promise.then((r) => ({ settled: true, result: r })),
    Promise.resolve({ settled: false, result: undefined as unknown as SubagentResult }),
  ]);

  return settled.settled ? settled.result : undefined;
}

/** Get the number of active background runs. */
export function getActiveBackgroundRunCount(): number {
  return backgroundRuns.size;
}