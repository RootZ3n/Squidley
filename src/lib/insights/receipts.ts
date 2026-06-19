import { INSIGHTS_RECEIPT_ACTION } from "./constants";
import type { ActivityReceiptInput } from "@/lib/activity-log/receipts";

export type InsightsModelPreferenceModuleId = "colloquium" | "fabrica" | "oculus";
export type InsightsModelPreferenceRole = "chatModel" | "buildModel" | "visionModel";

export function buildInsightsModelPreferenceChangedReceipt(args: {
  moduleId: InsightsModelPreferenceModuleId;
  role: InsightsModelPreferenceRole;
  model?: string;
  title?: string;
  summary?: string;
}): ActivityReceiptInput {
  return {
    module: "insights",
    action: INSIGHTS_RECEIPT_ACTION.modelPreferenceChanged,
    status: "succeeded",
    title: args.title ?? "Local model preference changed",
    summary: args.summary ?? `${labelForModule(args.moduleId)} now prefers ${args.model || "no saved model"} for ${args.role}. This stayed in browser localStorage.`,
    provider: "local",
    ...(args.model ? { model: args.model } : {}),
    modelUsed: false,
    changedLocalStorage: true,
    metadata: { moduleId: args.moduleId, role: args.role },
  };
}

export function buildInsightsModelPreferencesResetReceipt(): ActivityReceiptInput {
  return {
    module: "insights",
    action: INSIGHTS_RECEIPT_ACTION.modelPreferencesReset,
    status: "succeeded",
    title: "Local model preferences reset",
    summary: "Insights cleared browser-local model preferences. Peh still uses the local model server only.",
    modelUsed: false,
    changedLocalStorage: true,
  };
}

function labelForModule(moduleId: InsightsModelPreferenceModuleId): string {
  if (moduleId === "colloquium") return "Chat";
  if (moduleId === "fabrica") return "Workshop";
  return "Vision";
}
