export const OCULUS_TO_COLLOQUIUM_HANDOFF_KEY = "squidley.oculus.colloquiumAnalysis.v1";
export const OCULUS_TO_COLLOQUIUM_HANDOFF_KIND = "oculus-to-colloquium-analysis";

export const OCULUS_RECEIPT_ACTION = {
  analysisStarted: "oculus.analysis.started",
  analysisSucceeded: "oculus.analysis.succeeded",
  analysisFailed: "oculus.analysis.failed",
  handoffToColloquium: "oculus.handoff.to-colloquium",
  saveAnalysisToArchivum: "oculus.save-analysis-to-archivum",
} as const;

export const OCULUS_RECEIPT_ACTIONS = Object.values(OCULUS_RECEIPT_ACTION);
