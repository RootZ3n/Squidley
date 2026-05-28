/**
 * Optional cloud escalation for the reliability layer.
 *
 * Cloud is *never* called automatically. After a local task has failed in
 * a recoverable way the reliability runner may emit an `EscalationOffer`,
 * which is a description of what *would* be sent to a cloud model if the
 * user explicitly approved it.
 *
 * Key invariants enforced here:
 *   - We never construct an offer without a Velum-redacted preview.
 *   - `cloudUsed` is `false` on every receipt until consent has been
 *     granted *and* an actual cloud call has been made elsewhere.
 *   - In Peh, cloud execution is not implemented; this module
 *     therefore stops at "consent_denied"/"skipped" by default and exposes
 *     types so a future build can wire actual cloud calls without changing
 *     the receipt contract.
 *
 * `sanitizeReceiptText` from Tabularium is reused so emails, secrets, and
 * common key=value patterns are redacted in every emitted receipt.
 */

import {
  createTabulariumReceipt,
  sanitizeReceiptText,
  type TabulariumReceipt,
} from "@/lib/tabularium/receipts";
import { createVelumHandoffPayload, type VelumHandoffPayload } from "@/lib/velum/handoff";
import type { SmallModelTask } from "./types";

export type EscalationEventKind =
  | "local_failed"
  | "escalation_offered"
  | "cloud_packet_previewed"
  | "consent_granted"
  | "consent_denied"
  | "skipped";

export type EscalationConsentState = "pending" | "granted" | "denied" | "skipped";

export interface EscalationOffer {
  readonly id: string;
  readonly taskId: string;
  readonly reason: string;
  readonly beginnerExplanation: string;
  readonly redactedPreview: VelumHandoffPayload;
  readonly consentState: EscalationConsentState;
  readonly cloudConfigured: boolean;
  readonly cloudUsed: false;
  readonly createdAt: number;
}

export interface EscalationReceiptEvent {
  readonly kind: EscalationEventKind;
  readonly receipt: TabulariumReceipt;
}

export interface BuildEscalationOfferInput {
  readonly task: SmallModelTask;
  readonly localFailureSummary: string;
  readonly proposedPromptForCloud: string;
  readonly cloudConfigured: boolean;
  readonly now?: number;
}

/**
 * Build an escalation offer. Pure: no I/O, no fetch. The returned offer
 * has `consentState: "pending"` — nothing has been sent.
 */
export function buildEscalationOffer(
  input: BuildEscalationOfferInput,
): EscalationOffer | null {
  const now = input.now ?? Date.now();
  const redacted = createVelumHandoffPayload(
    sanitizeReceiptText(input.proposedPromptForCloud, 2000),
    now,
  );
  if (!redacted) return null;
  return {
    id: `esc-${now}-${Math.random().toString(36).slice(2, 8)}`,
    taskId: input.task.id,
    reason: sanitizeReceiptText(input.localFailureSummary, 220),
    beginnerExplanation:
      "The local model got stuck. Peh can ask a cloud model, but here is exactly what would be sent — and nothing has been sent yet.",
    redactedPreview: redacted,
    consentState: "pending",
    cloudConfigured: input.cloudConfigured,
    cloudUsed: false,
    createdAt: now,
  };
}

/**
 * Build the local_failed receipt that precedes any escalation offer.
 */
export function buildLocalFailedReceipt(args: {
  task: SmallModelTask;
  summary: string;
  now?: number;
}): EscalationReceiptEvent {
  const receipt = createTabulariumReceipt({
    module: "system",
    action: "reliability.local-failed",
    status: "failed",
    title: "Local model failed",
    summary: args.summary,
    metadata: {
      taskId: args.task.id,
      mode: args.task.mode,
      risk: args.task.riskLevel,
      cloud_used: false,
    },
    createdAt: args.now ?? Date.now(),
  });
  return { kind: "local_failed", receipt };
}

export function buildEscalationOfferedReceipt(args: {
  offer: EscalationOffer;
  now?: number;
}): EscalationReceiptEvent {
  const receipt = createTabulariumReceipt({
    module: "system",
    action: "reliability.escalation-offered",
    status: "info",
    title: "Cloud escalation offered",
    summary:
      "Peh offered to ask a cloud model. Nothing has been sent. The user must approve first.",
    metadata: {
      offerId: args.offer.id,
      taskId: args.offer.taskId,
      cloud_configured: args.offer.cloudConfigured,
      cloud_used: false,
      consent_state: args.offer.consentState,
    },
    createdAt: args.now ?? Date.now(),
  });
  return { kind: "escalation_offered", receipt };
}

export function buildCloudPacketPreviewedReceipt(args: {
  offer: EscalationOffer;
  now?: number;
}): EscalationReceiptEvent {
  const receipt = createTabulariumReceipt({
    module: "velum",
    action: "reliability.cloud-packet-previewed",
    status: "info",
    title: "Cloud packet previewed",
    summary:
      "The redacted preview of what would be sent has been shown. Nothing has been sent.",
    metadata: {
      offerId: args.offer.id,
      taskId: args.offer.taskId,
      redacted_chars: args.offer.redactedPreview.redactedText.length,
      cloud_used: false,
    },
    createdAt: args.now ?? Date.now(),
  });
  return { kind: "cloud_packet_previewed", receipt };
}

export function buildConsentDecisionReceipt(args: {
  offer: EscalationOffer;
  decision: "granted" | "denied" | "skipped";
  now?: number;
}): EscalationReceiptEvent {
  const isGranted = args.decision === "granted";
  const receipt = createTabulariumReceipt({
    module: "system",
    action: `reliability.consent-${args.decision}`,
    status: isGranted ? "info" : "interrupted",
    title:
      args.decision === "granted"
        ? "Consent granted (cloud not yet wired in this build)"
        : args.decision === "denied"
        ? "Consent denied — staying local"
        : "Escalation skipped — staying local",
    summary:
      isGranted
        ? "The user approved escalation. This build does not yet wire a cloud call, so nothing has been sent."
        : "Peh will stay local. Nothing has been sent.",
    metadata: {
      offerId: args.offer.id,
      taskId: args.offer.taskId,
      decision: args.decision,
      cloud_used: false,
    },
    createdAt: args.now ?? Date.now(),
  });
  return {
    kind:
      args.decision === "granted"
        ? "consent_granted"
        : args.decision === "denied"
        ? "consent_denied"
        : "skipped",
    receipt,
  };
}

/**
 * Convenience: build the full no-consent receipt timeline for a task whose
 * local run failed. Useful for callers who want a single function that
 * cannot accidentally call the cloud.
 */
export function buildEscalationTimelineNoConsent(args: {
  task: SmallModelTask;
  localFailureSummary: string;
  proposedPromptForCloud: string;
  cloudConfigured: boolean;
  decision: "denied" | "skipped";
  now?: number;
}): {
  offer: EscalationOffer | null;
  events: readonly EscalationReceiptEvent[];
} {
  const now = args.now ?? Date.now();
  const events: EscalationReceiptEvent[] = [
    buildLocalFailedReceipt({ task: args.task, summary: args.localFailureSummary, now }),
  ];
  const offer = buildEscalationOffer({
    task: args.task,
    localFailureSummary: args.localFailureSummary,
    proposedPromptForCloud: args.proposedPromptForCloud,
    cloudConfigured: args.cloudConfigured,
    now,
  });
  if (offer) {
    events.push(buildEscalationOfferedReceipt({ offer, now }));
    events.push(buildCloudPacketPreviewedReceipt({ offer, now }));
    events.push(buildConsentDecisionReceipt({ offer, decision: args.decision, now }));
  }
  return { offer, events };
}
