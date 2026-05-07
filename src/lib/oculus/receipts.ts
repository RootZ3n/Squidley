import { OCULUS_RECEIPT_ACTION } from "./constants";
import type { TabulariumReceiptInput } from "@/lib/tabularium/receipts";

export function buildOculusAnalysisStartedReceipt(args: { model: string }): TabulariumReceiptInput {
  return {
    module: "oculus",
    action: OCULUS_RECEIPT_ACTION.analysisStarted,
    status: "running",
    title: "Oculus local image analysis started",
    summary: "A user-selected image was sent to the local model server for analysis. The image is not stored in this receipt.",
    provider: "local",
    model: args.model,
    modelUsed: true,
  };
}

export function buildOculusAnalysisSucceededReceipt(args: {
  model: string;
  durationMs: number;
}): TabulariumReceiptInput {
  return {
    module: "oculus",
    action: OCULUS_RECEIPT_ACTION.analysisSucceeded,
    status: "succeeded",
    title: "Oculus local image analysis completed",
    summary: "The local vision model returned an image analysis. The image itself was not stored.",
    provider: "local",
    model: args.model,
    modelUsed: true,
    completedAt: Date.now(),
    metadata: { durationMs: args.durationMs },
  };
}

export function buildOculusAnalysisFailedReceipt(args: {
  model: string;
  message: string;
}): TabulariumReceiptInput {
  return {
    module: "oculus",
    action: OCULUS_RECEIPT_ACTION.analysisFailed,
    status: "failed",
    title: "Oculus local image analysis failed",
    summary: args.message,
    provider: "local",
    model: args.model,
    modelUsed: true,
    completedAt: Date.now(),
  };
}

export function buildOculusHandoffToColloquiumReceipt(): TabulariumReceiptInput {
  return {
    module: "oculus",
    action: OCULUS_RECEIPT_ACTION.handoffToColloquium,
    status: "info",
    title: "Oculus analysis sent to Colloquium",
    summary: "Only the analysis text was handed to Colloquium. The image was not included and nothing was sent automatically.",
    modelUsed: false,
  };
}

export function buildOculusSaveAnalysisToArchivumReceipt(args: {
  model?: string;
  entryId?: string;
  characterCount?: number;
  failed?: boolean;
}): TabulariumReceiptInput {
  if (args.failed) {
    return {
      module: "oculus",
      action: OCULUS_RECEIPT_ACTION.saveAnalysisToArchivum,
      status: "failed",
      title: "Oculus analysis save failed",
      summary: "Oculus could not save the analysis text to Archivum in this browser.",
      provider: "local",
      model: args.model,
      modelUsed: true,
    };
  }
  return {
    module: "oculus",
    action: OCULUS_RECEIPT_ACTION.saveAnalysisToArchivum,
    status: "succeeded",
    title: "Oculus analysis saved to Archivum",
    summary: "Only the Oculus analysis text was saved as a local Archivum entry. The image was not stored.",
    provider: "local",
    model: args.model,
    modelUsed: true,
    changedLocalStorage: true,
    relatedItemId: args.entryId,
    metadata: {
      source: "oculus-analysis",
      characterCount: args.characterCount ?? 0,
    },
  };
}
