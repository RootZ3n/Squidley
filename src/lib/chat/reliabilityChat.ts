/**
 * Adapter: invoke the Small Model Reliability Layer from chat routes.
 *
 * Only the compound tools that are safe to run from an HTTP route are
 * exposed here. Filesystem-touching tools (project structure, file
 * inspection) are deliberately NOT wired into chat — they would expose
 * the server's filesystem to anyone reaching the API and that decision
 * belongs to a future approval surface.
 *
 * Compound tools used here:
 *   - summarize_error_and_next_step (pure, no IO)
 *   - run_local_health_check       (local probe, no cloud)
 *
 * The adapter wraps the chosen compound tool inside `runReliability` so
 * the loop / retry / decompose / escalation-offer machinery still runs.
 * Validation passes when the compound tool produces non-empty content.
 */

import type { LocalProviderConfig } from "@/lib/providers/local";
import { probeLocalHealth } from "@/lib/providers/ollama";
import {
  runReliability,
  summarizeErrorAndNextStep,
  runLocalHealthCheck,
  summarizeReliabilityResultForBeginner,
  createSmallModelTask,
  type ReliabilityModelAction,
  type ReliabilityResult,
  type ToolEnvironment,
  type LocalHealthReport,
} from "@/lib/reliability";
import type { ChatReliabilityIntent } from "./reliabilityIntent";

export interface ReliabilityChatSummary {
  readonly intent: ChatReliabilityIntent;
  readonly summary: string;
  readonly stepCount: number;
  readonly cloudSuggested: boolean;
  readonly cloudUsed: false;
  readonly localOnly: true;
  readonly ok: boolean;
}

export interface ReliabilityChatOutcome {
  readonly intent: ChatReliabilityIntent;
  readonly reply: string;
  readonly result: ReliabilityResult;
  readonly summary: ReliabilityChatSummary;
}

export interface ReliabilityChatOptions {
  readonly intent: ChatReliabilityIntent;
  readonly message: string;
  readonly config: LocalProviderConfig;
  readonly fetchImpl?: typeof fetch;
  /** Inject a probe for tests. Defaults to the Ollama-tags probe. */
  readonly probe?: () => Promise<LocalHealthReport>;
  readonly cloudConfigured?: boolean;
  readonly now?: () => number;
}

function defaultProbe(args: {
  config: LocalProviderConfig;
  fetchImpl?: typeof fetch;
}): () => Promise<LocalHealthReport> {
  return async () => {
    const payload = await probeLocalHealth({
      config: args.config,
      fetchImpl: args.fetchImpl,
    });
    if (payload.ok) {
      return {
        ok: true,
        backend: payload.backendType ?? "ollama",
        endpoint: payload.endpoint,
        modelCount: payload.modelCount,
      };
    }
    return {
      ok: false,
      backend: "unknown",
      endpoint: payload.endpoint,
      error: payload.reason,
    };
  };
}

function buildHealthEnv(
  probe: () => Promise<LocalHealthReport>,
): ToolEnvironment {
  return {
    rootPath: "/",
    allowWriteOperations: false,
    async readDir() {
      throw new Error("readDir not available from chat route");
    },
    async readFile() {
      throw new Error("readFile not available from chat route");
    },
    async probeLocalHealth() {
      return probe();
    },
  };
}

/**
 * Run the chosen compound tool through the reliability runner and shape
 * the result for the chat layer. Returns a beginner-readable reply plus
 * a structured `summary` the UI can render alongside the message.
 */
export async function runReliabilityForChat(
  opts: ReliabilityChatOptions,
): Promise<ReliabilityChatOutcome> {
  const now = opts.now ?? Date.now;
  const task = createSmallModelTask({
    userPrompt: opts.message,
    now: now(),
  });

  let action: ReliabilityModelAction;
  if (opts.intent === "health_check") {
    const probe = opts.probe ?? defaultProbe({
      config: opts.config,
      fetchImpl: opts.fetchImpl,
    });
    const env = buildHealthEnv(probe);
    action = async () => {
      const toolResult = await runLocalHealthCheck(env);
      return {
        ok: toolResult.ok,
        content: toolResult.summary,
        evidence: toolResult.evidence,
        error: toolResult.ok ? undefined : toolResult.summary,
      };
    };
  } else {
    // summarize_error
    action = async () => {
      const toolResult = summarizeErrorAndNextStep({ errorText: opts.message });
      const text = `${toolResult.summary}\n\nSuggested next step: ${toolResult.nextStep}`;
      return {
        ok: toolResult.ok,
        content: text,
        evidence: toolResult.evidence,
        error: toolResult.ok ? undefined : toolResult.summary,
      };
    };
  }

  const result = await runReliability({
    task,
    action,
    cloudConfigured: opts.cloudConfigured ?? false,
    now,
  });

  const reply = result.ok
    ? result.finalAnswer
    : `${result.finalAnswer}\n\n${summarizeReliabilityResultForBeginner(result)}`;

  const summary: ReliabilityChatSummary = {
    intent: opts.intent,
    summary: summarizeReliabilityResultForBeginner(result),
    stepCount: result.steps.length,
    cloudSuggested: result.cloudSuggested,
    cloudUsed: false,
    localOnly: true,
    ok: result.ok,
  };

  return { intent: opts.intent, reply, result, summary };
}
