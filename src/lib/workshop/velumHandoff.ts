/**
 * Workshop Velum handoff preparation helpers.
 *
 * When the Workshop multi-file build preflight is blocked by velum-required,
 * these helpers let the UI record a local-only "handoff preparation" receipt
 * and build a metadata-only preview of what would need Velum review.
 *
 * Hard constraints:
 *   - No cloud execution. No provider calls. No model calls. No fetch.
 *   - No raw user text, code, document, or prompt content in receipts.
 *   - nothingSentYet is always true. cloudUsed is always false.
 *   - Does not mark velumReviewPassed=true.
 *   - Does not enable cloud consent.
 *   - Receipt write failure must not throw.
 */

import {
  logActivityReceipt,
  type ActivityReceipt,
  type ActivityReceiptInput,
} from "@/lib/activity-log/receipts";
import { FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID } from "./cloudPreflight";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FABRICA_VELUM_HANDOFF_ACTION =
  "velum-handoff.preparation" as const;

// ---------------------------------------------------------------------------
// Handoff preview result
// ---------------------------------------------------------------------------

export interface WorkshopVelumHandoffPreview {
  sourceModule: "workshop";
  capabilityId: typeof FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID;
  reason: string;
  dataCategories: readonly string[];
  nothingSentYet: true;
  cloudUsed: false;
  requiresVelumReview: true;
  velumReviewPassed: false;
}

export function buildWorkshopVelumHandoffPreview(): WorkshopVelumHandoffPreview {
  return {
    sourceModule: "workshop",
    capabilityId: FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID,
    reason:
      "Cloud-required action needs Velum review before cloud consent can be offered.",
    dataCategories: ["metadata-only"],
    nothingSentYet: true,
    cloudUsed: false,
    requiresVelumReview: true,
    velumReviewPassed: false,
  };
}

// ---------------------------------------------------------------------------
// Receipt builder
// ---------------------------------------------------------------------------

export function buildWorkshopVelumHandoffPreparedReceiptInput(args?: {
  createdAt?: number;
  receiptId?: string;
}): ActivityReceiptInput {
  return {
    id: args?.receiptId,
    createdAt: args?.createdAt,
    module: "workshop",
    action: FABRICA_VELUM_HANDOFF_ACTION,
    status: "info",
    title: "Velum review preparation recorded for Workshop multi-file build",
    summary:
      "Workshop recorded that Velum review is needed before cloud consent can be offered. Nothing has been sent.",
    modelUsed: false,
    metadata: {
      capabilityId: FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID,
      sourceModule: "workshop",
      requiresVelumReview: true,
      velumReviewPassed: false,
      nothingSentYet: true,
      cloudUsed: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Receipt recorder
// ---------------------------------------------------------------------------

export function recordWorkshopVelumHandoffPreparedReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args?: { createdAt?: number; receiptId?: string },
): ActivityReceipt | null {
  try {
    return logActivityReceipt(
      storage,
      buildWorkshopVelumHandoffPreparedReceiptInput(args),
    );
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Review completion — distinct from preparation
// ---------------------------------------------------------------------------

export const FABRICA_VELUM_REVIEW_COMPLETED_ACTION =
  "velum-review.completed" as const;

export interface WorkshopVelumReviewCompletedPreview {
  sourceModule: "workshop";
  capabilityId: typeof FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID;
  velumReviewPassed: true;
  requiresVelumReview: true;
  nothingSentYet: true;
  cloudUsed: false;
  dataCategories: readonly string[];
}

export function buildWorkshopVelumReviewCompletedPreview(): WorkshopVelumReviewCompletedPreview {
  return {
    sourceModule: "workshop",
    capabilityId: FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID,
    velumReviewPassed: true,
    requiresVelumReview: true,
    nothingSentYet: true,
    cloudUsed: false,
    dataCategories: ["metadata-only"],
  };
}

export function buildWorkshopVelumReviewCompletedReceiptInput(args?: {
  createdAt?: number;
  receiptId?: string;
}): ActivityReceiptInput {
  return {
    id: args?.receiptId,
    createdAt: args?.createdAt,
    module: "workshop",
    action: FABRICA_VELUM_REVIEW_COMPLETED_ACTION,
    status: "info",
    title: "Velum review marked complete for Workshop multi-file build",
    summary:
      "Workshop recorded that Velum review was completed locally. Cloud consent can now be offered. Nothing has been sent.",
    modelUsed: false,
    metadata: {
      capabilityId: FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID,
      sourceModule: "workshop",
      requiresVelumReview: true,
      velumReviewPassed: true,
      nothingSentYet: true,
      cloudUsed: false,
    },
  };
}

export function recordWorkshopVelumReviewCompletedReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args?: { createdAt?: number; receiptId?: string },
): ActivityReceipt | null {
  try {
    return logActivityReceipt(
      storage,
      buildWorkshopVelumReviewCompletedReceiptInput(args),
    );
  } catch {
    return null;
  }
}
