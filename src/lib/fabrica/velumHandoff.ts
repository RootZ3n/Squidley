/**
 * Fabrica Velum handoff preparation helpers.
 *
 * When the Fabrica multi-file build preflight is blocked by velum-required,
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
  logTabulariumReceipt,
  type TabulariumReceipt,
  type TabulariumReceiptInput,
} from "@/lib/tabularium/receipts";
import { FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID } from "./cloudPreflight";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FABRICA_VELUM_HANDOFF_ACTION =
  "velum-handoff.preparation" as const;

// ---------------------------------------------------------------------------
// Handoff preview result
// ---------------------------------------------------------------------------

export interface FabricaVelumHandoffPreview {
  sourceModule: "fabrica";
  capabilityId: typeof FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID;
  reason: string;
  dataCategories: readonly string[];
  nothingSentYet: true;
  cloudUsed: false;
  requiresVelumReview: true;
  velumReviewPassed: false;
}

export function buildFabricaVelumHandoffPreview(): FabricaVelumHandoffPreview {
  return {
    sourceModule: "fabrica",
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

export function buildFabricaVelumHandoffPreparedReceiptInput(args?: {
  createdAt?: number;
  receiptId?: string;
}): TabulariumReceiptInput {
  return {
    id: args?.receiptId,
    createdAt: args?.createdAt,
    module: "fabrica",
    action: FABRICA_VELUM_HANDOFF_ACTION,
    status: "info",
    title: "Velum review preparation recorded for Fabrica multi-file build",
    summary:
      "Fabrica recorded that Velum review is needed before cloud consent can be offered. Nothing has been sent.",
    modelUsed: false,
    metadata: {
      capabilityId: FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID,
      sourceModule: "fabrica",
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

export function recordFabricaVelumHandoffPreparedReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args?: { createdAt?: number; receiptId?: string },
): TabulariumReceipt | null {
  try {
    return logTabulariumReceipt(
      storage,
      buildFabricaVelumHandoffPreparedReceiptInput(args),
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

export interface FabricaVelumReviewCompletedPreview {
  sourceModule: "fabrica";
  capabilityId: typeof FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID;
  velumReviewPassed: true;
  requiresVelumReview: true;
  nothingSentYet: true;
  cloudUsed: false;
  dataCategories: readonly string[];
}

export function buildFabricaVelumReviewCompletedPreview(): FabricaVelumReviewCompletedPreview {
  return {
    sourceModule: "fabrica",
    capabilityId: FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID,
    velumReviewPassed: true,
    requiresVelumReview: true,
    nothingSentYet: true,
    cloudUsed: false,
    dataCategories: ["metadata-only"],
  };
}

export function buildFabricaVelumReviewCompletedReceiptInput(args?: {
  createdAt?: number;
  receiptId?: string;
}): TabulariumReceiptInput {
  return {
    id: args?.receiptId,
    createdAt: args?.createdAt,
    module: "fabrica",
    action: FABRICA_VELUM_REVIEW_COMPLETED_ACTION,
    status: "info",
    title: "Velum review marked complete for Fabrica multi-file build",
    summary:
      "Fabrica recorded that Velum review was completed locally. Cloud consent can now be offered. Nothing has been sent.",
    modelUsed: false,
    metadata: {
      capabilityId: FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID,
      sourceModule: "fabrica",
      requiresVelumReview: true,
      velumReviewPassed: true,
      nothingSentYet: true,
      cloudUsed: false,
    },
  };
}

export function recordFabricaVelumReviewCompletedReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args?: { createdAt?: number; receiptId?: string },
): TabulariumReceipt | null {
  try {
    return logTabulariumReceipt(
      storage,
      buildFabricaVelumReviewCompletedReceiptInput(args),
    );
  } catch {
    return null;
  }
}
