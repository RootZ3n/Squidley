/**
 * Local model answer wrapping for code-explanation / debugging /
 * troubleshooting requests.
 *
 * Pipeline:
 *   1. Call the local model via `handleChatRequest`.
 *   2. Validate the reply with `validateLocalAnswer`.
 *   3. If invalid, build a compact retry prompt that *names* the failure
 *      reason and retry once.
 *   4. If still invalid (or same failure signature), build an honest
 *      beginner-readable fallback with decomposition suggestions.
 *
 * Constraints baked in:
 *   - max 1 local retry (`MAX_LOCAL_RETRIES = 1`).
 *   - no cloud calls. Every receipt asserts `cloudUsed: false`.
 *   - no filesystem tools are exposed.
 *   - same-failure-signature ⇒ stop and decompose, never loop.
 *   - the original handler payload is preserved on success-first-try so
 *     casual chat stays fast and the response shape stays unchanged.
 */

import { createActivityReceipt, type ActivityReceipt } from "@/lib/activity-log/receipts";
import { buildFailureSignature } from "@/lib/reliability";
import type { HandlerResult } from "./handler";
import { handleChatRequest } from "./handler";
import type { LocalProviderConfig } from "@/lib/providers/local";
import type { ResolvedBackendType } from "./handler";
import type {
  ChatMessage,
  ChatRequestBody,
  ChatResponseBody,
  ChatSuccessBody,
} from "./types";
import {
  validateLocalAnswer,
  type AnswerValidation,
  type AnswerValidationReason,
} from "./answerValidator";

export const MAX_LOCAL_RETRIES = 1;

export type LocalAnswerReceiptAction =
  | "reliability.local-answer-validated"
  | "reliability.local-answer-retry-started"
  | "reliability.local-answer-retry-failed"
  | "reliability.local-answer-decomposed"
  | "reliability.local-answer-fallback-returned";

export type LocalAnswerReliabilityKind = "validated" | "retried-ok" | "fallback";

export interface LocalAnswerReliabilitySummary {
  readonly intent: "wrap";
  readonly kind: LocalAnswerReliabilityKind;
  readonly ok: boolean;
  readonly retries: number;
  readonly summary: string;
  readonly failureReason?: AnswerValidationReason;
  readonly decomposition?: readonly string[];
  readonly receipts: readonly ActivityReceipt[];
  readonly cloudUsed: false;
  readonly localOnly: true;
  readonly cloudSuggested: false;
}

export interface WrapLocalAnswerArgs {
  readonly body: ChatRequestBody;
  readonly config: LocalProviderConfig;
  readonly resolvedBackend?: ResolvedBackendType;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  /** Inject the handler — defaults to the real one. Tests use a fake. */
  readonly callHandler?: (input: {
    body: unknown;
    config: LocalProviderConfig;
    resolvedBackend?: ResolvedBackendType;
    fetchImpl?: typeof fetch;
    now?: () => number;
  }) => Promise<HandlerResult>;
}

export interface WrapLocalAnswerResult {
  /** Status to return from the route. Always 200 on local-OK fallback. */
  readonly status: number;
  /** Final chat response body to serialize. */
  readonly payload: ChatResponseBody;
  /** Reliability summary; null when first-try validation passed. */
  readonly summary: LocalAnswerReliabilitySummary | null;
}

const DEFAULT_DECOMPOSITION: readonly string[] = [
  "Paste the exact error message you saw, including the first few lines of the stack trace.",
  "Ask Peh to run a local health check ('is the local model working?').",
  "Ask about one file or one function at a time instead of the whole problem.",
  "If a cloud provider is configured, you can choose to escalate with a preview — Peh never does this automatically.",
];

function buildReceipt(args: {
  action: LocalAnswerReceiptAction;
  status: "info" | "succeeded" | "failed" | "interrupted";
  title: string;
  summary: string;
  metadata?: Record<string, string | number | boolean>;
  now: () => number;
}): ActivityReceipt {
  return createActivityReceipt({
    module: "system",
    action: args.action,
    status: args.status,
    title: args.title,
    summary: args.summary,
    metadata: { cloud_used: false, ...(args.metadata ?? {}) },
    createdAt: args.now(),
  });
}

function extractReply(payload: ChatResponseBody): string {
  if (payload.ok) return payload.reply ?? "";
  return "";
}

function buildRetryHistory(
  body: ChatRequestBody,
  firstReply: string,
  failure: AnswerValidation,
): ChatRequestBody {
  // Compact retry prompt: keep the original message, prepend the prior
  // assistant reply (so the model sees its own output), and append a
  // short failure-aware nudge. We don't quote raw user content again —
  // it's already in the history.
  const nudgeByReason: Record<AnswerValidationReason, string> = {
    empty:
      "Your previous reply was empty. Answer the question directly with concrete, specific text. Do not return whitespace or placeholders.",
    refusal:
      "Your previous reply was a generic refusal. The user is asking about local code or a local error — answer directly. If you truly cannot, say what specific information is missing.",
    "tool-noise":
      "Your previous reply only narrated a tool call. This build has no tool execution surface. Answer with plain text, no tool calls.",
    "fake-success":
      "Your previous reply claimed an edit or fix that you cannot actually perform — this build has no file write tools. Describe the change in words instead and let the user apply it.",
  };
  const nudge =
    failure.reason && nudgeByReason[failure.reason]
      ? nudgeByReason[failure.reason]
      : "Your previous reply did not answer the question. Please answer directly.";

  const newHistory: ChatMessage[] = [
    ...(body.history ?? []),
    { role: "user", content: body.message },
    {
      role: "assistant",
      content: firstReply.length > 0 ? firstReply : "(empty reply)",
    },
  ];
  return {
    message: nudge,
    ...(body.model ? { model: body.model } : {}),
    history: newHistory,
  };
}

function buildFallbackReply(failure: AnswerValidation): string {
  const head =
    failure.reason === "empty"
      ? "The local model returned an empty answer twice."
      : failure.reason === "refusal"
      ? "The local model gave a generic refusal twice."
      : failure.reason === "tool-noise"
      ? "The local model kept narrating tool calls instead of answering."
      : failure.reason === "fake-success"
      ? "The local model claimed an action it cannot actually perform."
      : "The local model did not produce a valid answer.";
  const bullets = DEFAULT_DECOMPOSITION.map((s) => `- ${s}`).join("\n");
  return `${head} Peh is being honest about that rather than guessing.\n\nSmaller next steps you can try:\n${bullets}`;
}

function buildFallbackPayload(args: {
  body: ChatRequestBody;
  config: LocalProviderConfig;
  fallbackReply: string;
  startedAt: number;
  now: () => number;
}): ChatSuccessBody {
  const completedAt = args.now();
  return {
    ok: true,
    provider: "local",
    cloudUsed: false,
    toolsUsed: false,
    model: args.config.model,
    reply: args.fallbackReply,
    startedAt: args.startedAt,
    completedAt,
    durationMs: Math.max(0, completedAt - args.startedAt),
    responseMode: "local_model",
  };
}

export async function wrapLocalAnswer(
  opts: WrapLocalAnswerArgs,
): Promise<WrapLocalAnswerResult> {
  const now = opts.now ?? Date.now;
  const handler = opts.callHandler ?? handleChatRequest;
  const startedAt = now();
  const receipts: ActivityReceipt[] = [];

  // Attempt 1
  const first = await handler({
    body: opts.body,
    config: opts.config,
    resolvedBackend: opts.resolvedBackend,
    fetchImpl: opts.fetchImpl,
    now,
  });

  // If the upstream handler returned a hard error (HTTP 4xx/5xx), pass
  // it through unchanged. The reliability layer does not retry transport
  // failures here — `handler.ts` already handles those with beginner text.
  if (!first.payload.ok) {
    return { status: first.status, payload: first.payload, summary: null };
  }

  const reply1 = extractReply(first.payload);
  const validation1 = validateLocalAnswer(reply1);
  if (validation1.ok) {
    // First-try success — return the payload UNCHANGED. Casual chat
    // shape and speed are preserved; no reliability note is added.
    return { status: first.status, payload: first.payload, summary: null };
  }

  // Record retry-started receipt
  receipts.push(
    buildReceipt({
      action: "reliability.local-answer-retry-started",
      status: "info",
      title: "Local answer retry started",
      summary: `First reply failed validation (${validation1.reason}). Retrying once.`,
      metadata: { reason: validation1.reason ?? "unknown" },
      now,
    }),
  );

  // Attempt 2
  const retryBody = buildRetryHistory(opts.body, reply1, validation1);
  const second = await handler({
    body: retryBody,
    config: opts.config,
    resolvedBackend: opts.resolvedBackend,
    fetchImpl: opts.fetchImpl,
    now,
  });

  const reply2 = second.payload.ok ? extractReply(second.payload) : "";
  const validation2 = second.payload.ok
    ? validateLocalAnswer(reply2)
    : { ok: false, reason: "empty" as AnswerValidationReason, detail: "upstream error" };

  const sameSignature =
    buildFailureSignature(validation1.detail ?? validation1.reason ?? "x") ===
    buildFailureSignature(validation2.detail ?? validation2.reason ?? "y");

  if (validation2.ok && second.payload.ok) {
    // Retry succeeded — return the second payload with a small reliability
    // summary so the UI can show a brief note.
    receipts.push(
      buildReceipt({
        action: "reliability.local-answer-validated",
        status: "succeeded",
        title: "Local answer validated after retry",
        summary: "Retry produced a valid answer.",
        metadata: { retries: 1 },
        now,
      }),
    );
    const summary: LocalAnswerReliabilitySummary = {
      intent: "wrap",
      kind: "retried-ok",
      ok: true,
      retries: 1,
      summary: "Peh re-asked the local model once and got a better answer.",
      receipts,
      cloudUsed: false,
      localOnly: true,
      cloudSuggested: false,
    };
    return {
      status: second.status,
      payload: { ...second.payload, reliability: summarizeForResponse(summary) },
      summary,
    };
  }

  // Retry failed — decompose with honest fallback.
  receipts.push(
    buildReceipt({
      action: "reliability.local-answer-retry-failed",
      status: "failed",
      title: "Local answer retry failed",
      summary: `Retry also failed validation (${validation2.reason ?? "unknown"}).${
        sameSignature ? " Same failure signature as the first attempt." : ""
      }`,
      metadata: {
        reason: validation2.reason ?? "unknown",
        same_signature: sameSignature,
      },
      now,
    }),
  );

  receipts.push(
    buildReceipt({
      action: "reliability.local-answer-decomposed",
      status: "info",
      title: "Local answer decomposed",
      summary:
        "Peh stopped retrying and suggested smaller next steps the user can pick.",
      metadata: { decomposition_count: DEFAULT_DECOMPOSITION.length },
      now,
    }),
  );

  const fallbackReply = buildFallbackReply(validation1);
  const fallbackPayload = buildFallbackPayload({
    body: opts.body,
    config: opts.config,
    fallbackReply,
    startedAt,
    now,
  });
  receipts.push(
    buildReceipt({
      action: "reliability.local-answer-fallback-returned",
      status: "interrupted",
      title: "Local answer fallback returned",
      summary: "Returned a beginner-readable fallback with decomposition steps.",
      metadata: { fallback_chars: fallbackReply.length },
      now,
    }),
  );

  const summary: LocalAnswerReliabilitySummary = {
    intent: "wrap",
    kind: "fallback",
    ok: false,
    retries: 1,
    summary:
      "Local model could not produce a valid answer after one retry. Peh returned an honest fallback with smaller next steps.",
    failureReason: validation1.reason,
    decomposition: DEFAULT_DECOMPOSITION,
    receipts,
    cloudUsed: false,
    localOnly: true,
    cloudSuggested: false,
  };

  return {
    status: 200,
    payload: { ...fallbackPayload, reliability: summarizeForResponse(summary) },
    summary,
  };
}

type ChatSuccessReliabilityField = NonNullable<
  Extract<ChatResponseBody, { ok: true }>["reliability"]
>;

/**
 * Shape the rich summary down to the structured field carried on
 * `ChatSuccessBody.reliability`. The full receipt array lives on the
 * `summary` value returned by `wrapLocalAnswer` for callers (route +
 * tests) that want to inspect it.
 */
function summarizeForResponse(
  summary: LocalAnswerReliabilitySummary,
): ChatSuccessReliabilityField {
  return {
    intent: "wrap",
    summary: summary.summary,
    stepCount: summary.receipts.length,
    cloudSuggested: false,
    cloudUsed: false,
    localOnly: true,
    ok: summary.ok,
    kind: summary.kind,
    retries: summary.retries,
    ...(summary.decomposition ? { decomposition: summary.decomposition } : {}),
    receiptActions: summary.receipts.map((r) => r.action),
  };
}

/**
 * Stream-mode helper: build the events to emit when the post-stream
 * validator rejects the accumulated reply. Pure: no IO. The caller
 * decides whether to retry (we do NOT — the stream path keeps event
 * ordering deterministic).
 */
export interface StreamReliabilityFallback {
  readonly reliabilityPayload: {
    type: "reliability";
    intent: "wrap";
    reply: string;
    summary: string;
    stepCount: number;
    cloudSuggested: false;
    cloudUsed: false;
    localOnly: true;
    ok: false;
    kind: "fallback";
    retries: 0;
    decomposition: readonly string[];
    receiptActions: readonly LocalAnswerReceiptAction[];
  };
  readonly receipts: readonly ActivityReceipt[];
}

export function buildStreamFallback(args: {
  reason: AnswerValidationReason;
  now?: () => number;
}): StreamReliabilityFallback {
  const now = args.now ?? Date.now;
  const fallbackReply = buildFallbackReply({ ok: false, reason: args.reason });
  const receipts: ActivityReceipt[] = [
    buildReceipt({
      action: "reliability.local-answer-decomposed",
      status: "info",
      title: "Local answer decomposed (stream)",
      summary:
        "Stream ended without a valid answer; Peh suggested smaller next steps instead of pretending success.",
      metadata: { mode: "stream", reason: args.reason },
      now,
    }),
    buildReceipt({
      action: "reliability.local-answer-fallback-returned",
      status: "interrupted",
      title: "Local answer fallback returned (stream)",
      summary: "Returned a beginner-readable fallback with decomposition steps.",
      metadata: { mode: "stream", fallback_chars: fallbackReply.length },
      now,
    }),
  ];
  return {
    reliabilityPayload: {
      type: "reliability",
      intent: "wrap",
      reply: fallbackReply,
      summary:
        "Local model stream ended without a valid answer. Peh returned an honest fallback with smaller next steps.",
      stepCount: receipts.length,
      cloudSuggested: false,
      cloudUsed: false,
      localOnly: true,
      ok: false,
      kind: "fallback",
      retries: 0,
      decomposition: DEFAULT_DECOMPOSITION,
      receiptActions: receipts.map((r) => r.action) as readonly LocalAnswerReceiptAction[],
    },
    receipts,
  };
}

export { DEFAULT_DECOMPOSITION };
