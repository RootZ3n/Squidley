import { VISION_RECEIPT_ACTION } from "./constants";
import type { ActivityReceiptInput } from "@/lib/activity-log/receipts";

export function buildVisionAnalysisStartedReceipt(args: { model: string }): ActivityReceiptInput {
  return {
    module: "vision",
    action: VISION_RECEIPT_ACTION.analysisStarted,
    status: "running",
    title: "Vision local image analysis started",
    summary: "A user-selected image was sent to the local model server for analysis. The image is not stored in this receipt.",
    provider: "local",
    model: args.model,
    modelUsed: true,
  };
}

export function buildVisionAnalysisSucceededReceipt(args: {
  model: string;
  durationMs: number;
}): ActivityReceiptInput {
  return {
    module: "vision",
    action: VISION_RECEIPT_ACTION.analysisSucceeded,
    status: "succeeded",
    title: "Vision local image analysis completed",
    summary: "The local vision model returned an image analysis. The image itself was not stored.",
    provider: "local",
    model: args.model,
    modelUsed: true,
    completedAt: Date.now(),
    metadata: { durationMs: args.durationMs },
  };
}

export function buildVisionAnalysisFailedReceipt(args: {
  model: string;
  message: string;
}): ActivityReceiptInput {
  return {
    module: "vision",
    action: VISION_RECEIPT_ACTION.analysisFailed,
    status: "failed",
    title: "Vision local image analysis failed",
    summary: args.message,
    provider: "local",
    model: args.model,
    modelUsed: true,
    completedAt: Date.now(),
  };
}

export function buildVisionHandoffToChatReceipt(): ActivityReceiptInput {
  return {
    module: "vision",
    action: VISION_RECEIPT_ACTION.handoffToChat,
    status: "info",
    title: "Vision analysis sent to Chat",
    summary: "Only the analysis text was handed to Chat. The image was not included and nothing was sent automatically.",
    modelUsed: false,
  };
}

export function buildVisionSaveAnalysisToNotebookReceipt(args: {
  model?: string;
  entryId?: string;
  characterCount?: number;
  failed?: boolean;
}): ActivityReceiptInput {
  if (args.failed) {
    return {
      module: "vision",
      action: VISION_RECEIPT_ACTION.saveAnalysisToNotebook,
      status: "failed",
      title: "Vision analysis save failed",
      summary: "Vision could not save the analysis text to Notebook in this browser.",
      provider: "local",
      model: args.model,
      modelUsed: true,
    };
  }
  return {
    module: "vision",
    action: VISION_RECEIPT_ACTION.saveAnalysisToNotebook,
    status: "succeeded",
    title: "Vision analysis saved to Notebook",
    summary: "Only the Vision analysis text was saved as a local Notebook entry. The image was not stored.",
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
