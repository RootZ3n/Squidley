/**
 * Cloud escalation consent dialog display helpers.
 *
 * Pure view-model builders for the consent dialog UI. These transform a
 * CloudEscalationPacket into a safe, beginner-friendly dialog view that
 * the presentational component renders.
 *
 * Hard constraints:
 *   - Pure. No fetch. No storage. No provider calls. No cloud calls.
 *   - Never includes raw user content (prompt, document, message, code,
 *     image data, secrets).
 *   - Only renders safe metadata and category labels.
 *   - Does not imply cloud has been used.
 */

import type { CloudEscalationPacket } from "./cloudEscalation";
import { isCloudEscalationActionable } from "./cloudEscalation";

export interface CloudEscalationDialogView {
  capabilityId: string;
  title: string;
  beginnerExplanation: string;
  reason: string;
  dataCategoryLabels: readonly string[];
  providerProfileLabels: readonly string[];
  consentStateLabel: string;
  velumLine: string | null;
  nothingSentLine: string;
  blockedLines: readonly string[];
  canGrant: boolean;
  grantDisabledReason: string | null;
  grantButtonLabel: string;
  denyButtonLabel: string;
}

const DATA_CATEGORY_DISPLAY: Record<string, string> = {
  "user-message": "Your message text",
  "document-excerpt": "Document excerpt",
  "summary": "Summary text",
  "metadata-only": "Metadata only (no content)",
  "image": "Image data",
  "code": "Code snippet",
  "external-query": "External query",
  "unknown": "Data category not specified",
};

const CONSENT_STATE_DISPLAY: Record<string, string> = {
  "not-required": "Cloud is not required.",
  "required": "Your explicit consent is needed before anything is sent.",
  "granted": "Cloud access has been allowed for this offer.",
  "denied": "Cloud access was denied.",
  "blocked": "Cloud escalation is currently blocked.",
};

function formatDataCategory(category: string): string {
  return DATA_CATEGORY_DISPLAY[category] ?? category;
}

function formatProviderProfile(profile: { providerId: string; capabilityProfile: string }): string {
  return `${profile.providerId} (${profile.capabilityProfile})`;
}

function resolveVelumLine(packet: CloudEscalationPacket): string | null {
  if (!packet.requiresVelumReview) return null;
  if (packet.velumReviewPassed) {
    return "Velum safety review has been completed for this content.";
  }
  return "Velum safety review is required before any data can be sent to the cloud.";
}

function resolveGrantability(packet: CloudEscalationPacket): {
  canGrant: boolean;
  reason: string | null;
} {
  if (!isCloudEscalationActionable(packet)) {
    if (packet.consentState === "denied") {
      return { canGrant: false, reason: "Cloud access was denied for this offer." };
    }
    if (packet.consentState === "blocked") {
      return { canGrant: false, reason: "Cloud escalation is blocked for this capability." };
    }
    if (packet.state === "BLOCKED") {
      return { canGrant: false, reason: "This capability is currently blocked." };
    }
    return { canGrant: false, reason: "This offer is not currently actionable." };
  }
  if (packet.requiresVelumReview && !packet.velumReviewPassed) {
    return {
      canGrant: false,
      reason: "Velum safety review must be completed before cloud access can be granted.",
    };
  }
  return { canGrant: true, reason: null };
}

export function cloudEscalationPacketToDialogView(
  packet: CloudEscalationPacket,
): CloudEscalationDialogView {
  const { canGrant, reason: grantDisabledReason } = resolveGrantability(packet);

  return {
    capabilityId: packet.capabilityId,
    title: `Cloud escalation: ${packet.capabilityId}`,
    beginnerExplanation: packet.beginnerExplanation,
    reason: packet.reason,
    dataCategoryLabels: packet.dataCategories.map(formatDataCategory),
    providerProfileLabels: packet.providerProfilesNeeded.map(formatProviderProfile),
    consentStateLabel: CONSENT_STATE_DISPLAY[packet.consentState] ?? "Consent state unknown.",
    velumLine: resolveVelumLine(packet),
    nothingSentLine: "Nothing has been sent yet.",
    blockedLines: [...packet.blockedReasons],
    canGrant,
    grantDisabledReason,
    grantButtonLabel: "Allow cloud for this",
    denyButtonLabel: "Keep local / deny",
  };
}

export function canGrantCloudEscalationFromDialog(
  packet: CloudEscalationPacket,
): boolean {
  return resolveGrantability(packet).canGrant;
}
