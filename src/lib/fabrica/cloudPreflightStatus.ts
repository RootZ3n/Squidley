/**
 * Pure status copy helper for Fabrica cloud-required boundary preflight.
 *
 * Returns beginner-friendly messages and a Tabularium hint based on
 * preflight or consent decision state. No side effects, no fetch,
 * no provider/model/cloud calls.
 */

import type { GuardedCloudPreflightBlockedBy } from "@/lib/capabilities/guardedCloudPreflight";
import type { CloudConsentDecision } from "@/lib/capabilities/cloudConsentReceipts";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface FabricaCloudPreflightStatusCopy {
  message: string;
  tabulariumHint: string;
  variant: "blocked" | "offered" | "granted" | "denied" | "cancelled";
}

// ---------------------------------------------------------------------------
// Preflight status copy
// ---------------------------------------------------------------------------

export function fabricaPreflightStatusCopy(
  blockedBy: GuardedCloudPreflightBlockedBy,
  allowedToOfferCloud: boolean,
): FabricaCloudPreflightStatusCopy | null {
  if (blockedBy === "velum-required") {
    return {
      message:
        "This action needs Velum review before cloud consent can be offered. Nothing has been sent.",
      tabulariumHint: TABULARIUM_HINT,
      variant: "blocked",
    };
  }
  if (blockedBy === "gateway-policy") {
    return {
      message:
        "Gateway policy blocked cloud escalation for this request. Nothing has been sent.",
      tabulariumHint: TABULARIUM_HINT,
      variant: "blocked",
    };
  }
  if (allowedToOfferCloud) {
    return {
      message:
        "Cloud consent can be offered. Review the dialog before deciding.",
      tabulariumHint: TABULARIUM_HINT,
      variant: "offered",
    };
  }
  if (
    blockedBy === "cloud-not-applicable" ||
    blockedBy === "capability"
  ) {
    return {
      message:
        "Cloud escalation is not applicable for this action. Nothing has been sent.",
      tabulariumHint: TABULARIUM_HINT,
      variant: "blocked",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Consent decision status copy
// ---------------------------------------------------------------------------

export function fabricaConsentStatusCopy(
  decision: CloudConsentDecision,
): FabricaCloudPreflightStatusCopy {
  switch (decision) {
    case "granted":
      return {
        message:
          "Cloud consent was recorded. Execution is not enabled yet, so nothing was sent.",
        tabulariumHint: TABULARIUM_HINT,
        variant: "granted",
      };
    case "denied":
      return {
        message:
          "Cloud consent was denied. Squidley will keep this local or stop this action.",
        tabulariumHint: TABULARIUM_HINT,
        variant: "denied",
      };
    case "cancelled":
      return {
        message:
          "Cloud consent was cancelled. Nothing was sent.",
        tabulariumHint: TABULARIUM_HINT,
        variant: "cancelled",
      };
    case "blocked":
      return {
        message:
          "Cloud consent was blocked. Nothing has been sent.",
        tabulariumHint: TABULARIUM_HINT,
        variant: "blocked",
      };
  }
}

// ---------------------------------------------------------------------------
// Shared constant
// ---------------------------------------------------------------------------

const TABULARIUM_HINT = "Recorded in Tabularium \u2192 Trust chains.";
