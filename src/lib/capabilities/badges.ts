/**
 * Capability transparency badge helpers.
 *
 * Pure mappers from a CapabilityRuntimeDecision OR a Tabularium-style
 * capability decision metadata blob into a small, beginner-friendly view
 * model. UI components consume these — they do not import provider, fetch,
 * or storage code from here.
 *
 * Important contract:
 *   - These helpers describe *decisions and permissions*, not *invocations*.
 *   - `cloudUsed` is ALWAYS false: a capability decision receipt records
 *     what Squidley evaluated, never that a cloud call took place.
 *   - `cloudAllowed === true` means cloud is permitted (consent + Velum +
 *     matching cloud profile). It is NOT the same as "cloud was used."
 *   - `providerMode === "cloud"` likewise describes routing intent on a
 *     decision, not that a network call occurred.
 */

import type {
  CapabilityRuntimeState,
  CapabilityTier,
} from "./contracts";
import type { CapabilityProviderMode } from "./receipts";
import type { CapabilityRuntimeDecision } from "./runtime";

export type CapabilityBadgeTone =
  | "local"
  | "limited"
  | "cloud-optional"
  | "cloud-required"
  | "blocked"
  | "neutral";

export interface CapabilityBadgeView {
  label: string;
  tone: CapabilityBadgeTone;
  shortDescription: string;
  detail: string;
  cloudUsed: boolean;
  localAttemptAllowed: boolean;
  cloudAllowed: boolean;
}

const STATE_LABELS: Record<CapabilityRuntimeState, string> = {
  LOCAL_READY: "Local ready",
  LOCAL_LIMITED: "Local limited",
  CLOUD_OPTIONAL: "Cloud optional",
  CLOUD_REQUIRED: "Cloud required",
  BLOCKED: "Blocked",
};

const STATE_TONES: Record<CapabilityRuntimeState, CapabilityBadgeTone> = {
  LOCAL_READY: "local",
  LOCAL_LIMITED: "limited",
  CLOUD_OPTIONAL: "cloud-optional",
  CLOUD_REQUIRED: "cloud-required",
  BLOCKED: "blocked",
};

const STATE_SHORT_DESCRIPTIONS: Record<CapabilityRuntimeState, string> = {
  LOCAL_READY: "Runs locally on your device.",
  LOCAL_LIMITED: "Can run locally; results may be limited.",
  CLOUD_OPTIONAL: "Local works; cloud may improve the result.",
  CLOUD_REQUIRED: "Cloud is required.",
  BLOCKED: "Currently unavailable.",
};

export function capabilityStateToBadgeLabel(
  state: CapabilityRuntimeState | string,
): string {
  if (isCapabilityRuntimeState(state)) return STATE_LABELS[state];
  return "Capability decision";
}

function isCapabilityRuntimeState(value: unknown): value is CapabilityRuntimeState {
  return (
    value === "LOCAL_READY" ||
    value === "LOCAL_LIMITED" ||
    value === "CLOUD_OPTIONAL" ||
    value === "CLOUD_REQUIRED" ||
    value === "BLOCKED"
  );
}

function detailFor(
  state: CapabilityRuntimeState,
  cloudAllowed: boolean,
  honestMessage?: string,
): string {
  switch (state) {
    case "LOCAL_READY":
      return "Squidley can run this locally. No cloud is required.";
    case "LOCAL_LIMITED":
      return "Squidley can try this locally, but results may be weaker or slower than a larger model.";
    case "CLOUD_OPTIONAL":
      return "Squidley can run this locally. Cloud could improve the result, but is not used unless you opt in.";
    case "CLOUD_REQUIRED":
      return cloudAllowed
        ? "This needs a cloud capability. Cloud is allowed, but nothing has been sent yet from this decision."
        : "This needs a cloud capability before it can run. Nothing has been sent.";
    case "BLOCKED": {
      const trimmed = honestMessage?.trim();
      if (trimmed && trimmed.length > 0) return trimmed;
      return "This capability is currently unavailable.";
    }
  }
}

const NEUTRAL_VIEW: CapabilityBadgeView = {
  label: "Capability decision",
  tone: "neutral",
  shortDescription: "Capability state is not available.",
  detail:
    "Squidley does not have enough information to describe this capability decision yet.",
  cloudUsed: false,
  localAttemptAllowed: false,
  cloudAllowed: false,
};

export function capabilityDecisionToBadgeView(
  decision: CapabilityRuntimeDecision,
): CapabilityBadgeView {
  return {
    label: STATE_LABELS[decision.state],
    tone: STATE_TONES[decision.state],
    shortDescription: STATE_SHORT_DESCRIPTIONS[decision.state],
    detail: detailFor(decision.state, decision.canUseCloud, decision.honestMessage),
    cloudUsed: false,
    localAttemptAllowed: decision.canAttemptLocally,
    cloudAllowed: decision.canUseCloud,
  };
}

/**
 * Tolerant view-builder for receipt metadata as it lands in Tabularium —
 * keys may be missing, mistyped, or truncated. Falls back to a neutral view
 * rather than throwing.
 */
export function capabilityReceiptMetadataToBadgeView(
  metadata: Readonly<Record<string, string | number | boolean>> | null | undefined,
): CapabilityBadgeView {
  if (!metadata || typeof metadata !== "object") return { ...NEUTRAL_VIEW };

  const stateRaw = metadata.capabilityState;
  if (!isCapabilityRuntimeState(stateRaw)) return { ...NEUTRAL_VIEW };

  const cloudAllowed = metadata.cloudAllowed === true;
  const localAttemptAllowed = metadata.localAttemptAllowed === true;
  const honestMessage =
    typeof metadata.honestMessage === "string" ? metadata.honestMessage : undefined;

  return {
    label: STATE_LABELS[stateRaw],
    tone: STATE_TONES[stateRaw],
    shortDescription: STATE_SHORT_DESCRIPTIONS[stateRaw],
    detail: detailFor(stateRaw, cloudAllowed, honestMessage),
    cloudUsed: false,
    localAttemptAllowed,
    cloudAllowed,
  };
}

/**
 * Tailwind class for the badge pill. Mirrors the tone palette already used
 * in `RatioCapabilityNote` (emerald for ready, amber for limited, iris for
 * cloud states, rose for blocked, slate for neutral).
 */
export function capabilityBadgeToneClass(tone: CapabilityBadgeTone): string {
  const base =
    "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]";
  switch (tone) {
    case "local":
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100`;
    case "limited":
      return `${base} border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100`;
    case "cloud-optional":
    case "cloud-required":
      return `${base} border-iris-200 bg-iris-50 text-iris-800 dark:border-iris-700/60 dark:bg-iris-900/20 dark:text-iris-100`;
    case "blocked":
      return `${base} border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-100`;
    case "neutral":
      return `${base} border-ink-200 bg-ink-50 text-ink-700 dark:border-ink-700/60 dark:bg-ink-800/40 dark:text-ink-200`;
  }
}

/** Re-exported types so consumers can pick up the badge tone enum easily. */
export type { CapabilityProviderMode, CapabilityRuntimeState, CapabilityTier };
