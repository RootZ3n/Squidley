/**
 * Peh capability registry contracts.
 *
 * A Capability is a per-action surface inside a public module. Each entry in a
 * module's `assessmentActions` list maps to exactly one Capability. Capabilities are
 * the unit at which Peh reasons about local readiness, cloud requirements,
 * and beginner-honest messaging.
 *
 * This file only defines contracts. The static registry lives in `registry.ts`.
 * The runtime decision engine that *uses* these capabilities is intentionally
 * out of scope for this contract.
 */

export type CapabilityTier =
  | "local-core"
  | "local-limited"
  | "cloud-optional"
  | "cloud-required"
  | "blocked";

export type CapabilityRuntimeState =
  | "LOCAL_READY"
  | "LOCAL_LIMITED"
  | "CLOUD_OPTIONAL"
  | "CLOUD_REQUIRED"
  | "BLOCKED";

export type ProviderCapabilityProfile =
  | "chat"
  | "code"
  | "vision"
  | "embeddings"
  | "long-context"
  | "tool-use";

export interface ProviderRequirement {
  providerId: string;
  capabilityProfile: ProviderCapabilityProfile;
  minParamsB?: number;
}

export interface CapabilityHonestMessages {
  localReady?: string;
  localLimited?: string;
  cloudOptional?: string;
  cloudRequired?: string;
  blocked?: string;
}

export interface Capability {
  id: string;
  moduleId: string;
  displayName: string;
  beginnerDescription: string;
  tier: CapabilityTier;
  localRequirements: readonly ProviderRequirement[];
  cloudRequirements: readonly ProviderRequirement[];
  honestMessages: CapabilityHonestMessages;
  receiptActions: readonly string[] | "none";
  velumGated: boolean;
}

export const CAPABILITY_TIERS: readonly CapabilityTier[] = [
  "local-core",
  "local-limited",
  "cloud-optional",
  "cloud-required",
  "blocked",
] as const;

export const CAPABILITY_RUNTIME_STATES: readonly CapabilityRuntimeState[] = [
  "LOCAL_READY",
  "LOCAL_LIMITED",
  "CLOUD_OPTIONAL",
  "CLOUD_REQUIRED",
  "BLOCKED",
] as const;
