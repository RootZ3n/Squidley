/**
 * Workshop cloud-required boundary preflight helper.
 *
 * Delegates to the guarded cloud escalation preflight for the
 * workshop:workshop.multi-file-build capability. This is the real
 * boundary gate for Workshop advanced/multi-file builds.
 *
 * Hard constraints:
 *   - No cloud execution. No provider switching. No routing changes.
 *   - No global consent persistence.
 *   - nothingSentYet is always true.
 *   - cloudUsed is always false.
 *   - No fetch. No provider calls. No model calls.
 */

import {
  runGuardedCloudEscalationPreflight,
  type GuardedCloudPreflightInput,
  type GuardedCloudPreflightResult,
} from "@/lib/capabilities/guardedCloudPreflight";

// ---------------------------------------------------------------------------
// Capability constant
// ---------------------------------------------------------------------------

export const FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID =
  "workshop:workshop.multi-file-build" as const;

// ---------------------------------------------------------------------------
// Input type — Workshop-specific subset
// ---------------------------------------------------------------------------

export interface WorkshopMultiFileBuildPreflightInput {
  /** Only used for deterministic gateway assessment. Never written raw into receipts or results. */
  userTextForAssessment?: string;
  velumReviewPassed?: boolean;
  recordReceipts?: boolean;
  storage?: Pick<Storage, "getItem" | "setItem">;
}

// ---------------------------------------------------------------------------
// Preflight helper
// ---------------------------------------------------------------------------

export function runWorkshopMultiFileBuildCloudPreflight(
  args: WorkshopMultiFileBuildPreflightInput = {},
): GuardedCloudPreflightResult {
  const input: GuardedCloudPreflightInput = {
    capabilityId: FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID,
    dataCategories: ["metadata-only"],
    availableLocalProfiles: [],
    availableCloudProfiles: [
      { providerId: "future-cloud-agent", capabilityProfile: "tool-use" },
    ],
    cloudUnlocked: false,
    cloudConsentGranted: false,
    velumReviewPassed: args.velumReviewPassed ?? false,
    userTextForAssessment: args.userTextForAssessment,
    recordReceipts: args.recordReceipts,
    storage: args.storage,
  };
  return runGuardedCloudEscalationPreflight(input);
}
