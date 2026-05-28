import { NOUS_RECEIPT_ACTION } from "./constants";
import type { TabulariumReceiptInput } from "@/lib/tabularium/receipts";

export type NousModelPreferenceModuleId = "colloquium" | "fabrica" | "oculus";
export type NousModelPreferenceRole = "chatModel" | "buildModel" | "visionModel";

export function buildNousModelPreferenceChangedReceipt(args: {
  moduleId: NousModelPreferenceModuleId;
  role: NousModelPreferenceRole;
  model?: string;
  title?: string;
  summary?: string;
}): TabulariumReceiptInput {
  return {
    module: "nous",
    action: NOUS_RECEIPT_ACTION.modelPreferenceChanged,
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

export function buildNousModelPreferencesResetReceipt(): TabulariumReceiptInput {
  return {
    module: "nous",
    action: NOUS_RECEIPT_ACTION.modelPreferencesReset,
    status: "succeeded",
    title: "Local model preferences reset",
    summary: "Nous cleared browser-local model preferences. Peh still uses the local model server only.",
    modelUsed: false,
    changedLocalStorage: true,
  };
}

function labelForModule(moduleId: NousModelPreferenceModuleId): string {
  if (moduleId === "colloquium") return "Colloquium";
  if (moduleId === "fabrica") return "Fabrica";
  return "Oculus";
}
