/**
 * Squidley operating mode types.
 *
 * Two clear modes:
 *   - local: audited local-first behavior, cloud locked, no tool execution
 *   - cloud: explicit opt-in, cloud APIs enabled, tools can be enabled
 *
 * Mode determines what Squidley can do. It is NOT inferred from API keys
 * or environment variables alone — cloud mode requires explicit activation.
 */

export type SquidleyMode = "local" | "cloud";

export type ToolPolicy = "none" | "local-safe" | "approval-gated" | "all";
export type ProviderPolicy = "local-only" | "cloud-configured";
export type CapabilityPolicy = "local-baseline" | "cloud-extended";

export interface ModeState {
  /** The resolved operating mode. */
  readonly mode: SquidleyMode;
  /** Whether cloud providers are unlocked for use. */
  readonly cloudUnlocked: boolean;
  /** Which tool execution policy is active. */
  readonly toolPolicy: ToolPolicy;
  /** Which provider policy is active. */
  readonly providerPolicy: ProviderPolicy;
  /** Which capability scope is active. */
  readonly capabilityPolicy: CapabilityPolicy;
  /** Whether user consent is required for cloud/tool actions. */
  readonly consentRequired: boolean;
  /** Whether receipts are required for all actions. */
  readonly receiptsRequired: boolean;
  /** Whether the local-only egress guard is enabled. */
  readonly localOnlyGuardEnabled: boolean;
  /** Whether the egress guard blocks non-local fetches. */
  readonly egressGuardEnabled: boolean;
}

export const LOCAL_MODE_STATE: ModeState = {
  mode: "local",
  cloudUnlocked: false,
  toolPolicy: "none",
  providerPolicy: "local-only",
  capabilityPolicy: "local-baseline",
  consentRequired: false,
  receiptsRequired: true,
  localOnlyGuardEnabled: true,
  egressGuardEnabled: true,
} as const;

export const CLOUD_MODE_STATE: ModeState = {
  mode: "cloud",
  cloudUnlocked: true,
  toolPolicy: "approval-gated",
  providerPolicy: "cloud-configured",
  capabilityPolicy: "cloud-extended",
  consentRequired: true,
  receiptsRequired: true,
  localOnlyGuardEnabled: false,
  egressGuardEnabled: false,
} as const;
