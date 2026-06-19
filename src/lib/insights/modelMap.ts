import { PUBLIC_MODULES } from "@/lib/modules/registry";
import type { ModuleCategory } from "@/lib/modules/contracts";
import type { LocalModelInfo } from "@/lib/providers/ollama";
import type { ProviderId } from "@/lib/providers/registry";
import {
  resolveChatModel,
  resolveWorkshopBuildModel,
  resolveVisionVisionModel,
  type InsightsModelPreferencesDocument,
} from "./modelPreferences";

export type InsightsModelRole = "chat" | "vision" | "build" | "review" | "none";
export type InsightsCurrentStatus = "active" | "local-only" | "locked" | "not-wired-yet";

export interface InsightsModuleCapability {
  moduleId: string;
  displayName: string;
  beginnerDescription: string;
  category: ModuleCategory;
  usesModel: boolean;
  modelRole: InsightsModelRole;
  defaultProvider: ProviderId | "none";
  selectedProvider: ProviderId | "none";
  selectedModel: string;
  localOnlySupported: boolean;
  cloudCapable: boolean;
  cloudUnlockRequired: boolean;
  currentStatus: InsightsCurrentStatus;
  explanation: string;
}

export function buildInsightsModuleMap(args: {
  preferences: InsightsModelPreferencesDocument;
  models: readonly LocalModelInfo[];
  configuredModel?: string;
}): InsightsModuleCapability[] {
  const colloquiumModel = resolveChatModel(args);
  const oculusModel = resolveVisionVisionModel(args);
  const fabricaModel = resolveWorkshopBuildModel(args);

  return PUBLIC_MODULES.filter((module) =>
    ["colloquium", "oculus", "fabrica", "velum", "archivum", "more-input", "tabularium", "nous"].includes(module.id),
  ).map((module) => {
    if (module.id === "colloquium") {
      return {
        moduleId: module.id,
        displayName: module.displayName,
        beginnerDescription: module.beginnerDescription,
        category: module.category,
        usesModel: true,
        modelRole: "chat",
        defaultProvider: "ollama",
        selectedProvider: "ollama",
        selectedModel: colloquiumModel,
        localOnlySupported: true,
        cloudCapable: true,
        cloudUnlockRequired: false,
        currentStatus: "active",
        explanation:
          "Chat chats through your configured local model server. Ollama is validated end-to-end; llama.cpp text support uses an OpenAI-compatible local backend pending real llama-server binary validation. No cloud fallback is active.",
      } satisfies InsightsModuleCapability;
    }

    if (module.id === "oculus") {
      return {
        moduleId: module.id,
        displayName: module.displayName,
        beginnerDescription: module.beginnerDescription,
        category: module.category,
        usesModel: true,
        modelRole: "vision",
        defaultProvider: "ollama",
        selectedProvider: "ollama",
        selectedModel: oculusModel,
        localOnlySupported: true,
        cloudCapable: true,
        cloudUnlockRequired: false,
        currentStatus: "active",
        explanation:
          "Vision can ask a local vision-capable model to analyze an image you choose. Images are not watched or stored by default.",
      } satisfies InsightsModuleCapability;
    }

    if (module.id === "fabrica") {
      return {
        moduleId: module.id,
        displayName: module.displayName,
        beginnerDescription: module.beginnerDescription,
        category: module.category,
        usesModel: true,
        modelRole: "build",
        defaultProvider: "ollama",
        selectedProvider: "ollama",
        selectedModel: fabricaModel,
        localOnlySupported: true,
        cloudCapable: true,
        cloudUnlockRequired: false,
        currentStatus: "active",
        explanation:
          "Workshop can ask a local model for a single-file suggestion. It does not write files, run commands, or act as a coding agent.",
      } satisfies InsightsModuleCapability;
    }

    return {
      moduleId: module.id,
      displayName: module.displayName,
      beginnerDescription: module.beginnerDescription,
      category: module.category,
      usesModel: false,
      modelRole: "none",
      defaultProvider: "none",
      selectedProvider: "none",
      selectedModel: "",
      localOnlySupported: module.localOnlySupported,
      cloudCapable: false,
      cloudUnlockRequired: module.cloudUnlockRequired,
      currentStatus: module.cloudUnlockRequired ? "locked" : "local-only",
      explanation: explanationForNoModel(module.id),
    } satisfies InsightsModuleCapability;
  });
}

function explanationForNoModel(moduleId: string): string {
  switch (moduleId) {
    case "velum":
      return "Velum uses deterministic browser-side checks for this public safety review. It does not call a model.";
    case "archivum":
      return "Notebook stores notes and documents in this browser. It does not use a model or server storage.";
    case "more-input":
      return "More Input is the manual paste flow for Notebook. It stores only what you explicitly save.";
    case "tabularium":
      return "ActivityLog records browser-local receipts so you can see what happened. It does not upload telemetry.";
    case "nous":
      return "Insights is this map. It explains modules, models, and providers without calling a model.";
    default:
      return "This module does not use a model in the current public local version.";
  }
}
