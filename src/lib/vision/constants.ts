export const VISION_TO_CHAT_HANDOFF_KEY = "peh.vision.chatAnalysis.v1";
export const VISION_TO_CHAT_HANDOFF_KIND = "vision-to-chat-analysis";

export const VISION_RECEIPT_ACTION = {
  analysisStarted: "vision.analysis.started",
  analysisSucceeded: "vision.analysis.succeeded",
  analysisFailed: "vision.analysis.failed",
  handoffToChat: "vision.handoff.to-chat",
  saveAnalysisToNotebook: "vision.save-analysis-to-notebook",
} as const;

export const VISION_RECEIPT_ACTIONS = Object.values(VISION_RECEIPT_ACTION);
