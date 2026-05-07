import { isLikelyVisionModel } from "@/lib/oculus/helpers";
import { chooseDefaultModel, type LocalModelInfo } from "@/lib/providers/ollama";
export { NOUS_MODEL_PREFERENCES_KEY } from "@/lib/nous/constants";
import { NOUS_MODEL_PREFERENCES_KEY } from "@/lib/nous/constants";

export const NOUS_MODEL_PREFERENCES_VERSION = 1;

export type NousModelRole = "chatModel" | "visionModel" | "buildModel";
export type NousPreferenceModuleId = "colloquium" | "oculus" | "fabrica";
export type ModelSourceKind =
  | "fromNousPreference"
  | "fromPageSelection"
  | "fallbackDefault"
  | "fallbackFirstDiscovered"
  | "unavailable";

export interface ModelSourceExplanation {
  kind: ModelSourceKind;
  message: string;
}

export interface NousModuleModelPreferences {
  chatModel?: string;
  visionModel?: string;
  buildModel?: string;
}

export interface NousModelPreferencesDocument {
  version: typeof NOUS_MODEL_PREFERENCES_VERSION;
  savedAt: number;
  localOnly: true;
  cloudUsed: false;
  modules: Partial<Record<NousPreferenceModuleId, NousModuleModelPreferences>>;
}

export function createModelPreferencesDocument(
  modules: Partial<Record<NousPreferenceModuleId, NousModuleModelPreferences>> = {},
  now = Date.now(),
): NousModelPreferencesDocument {
  return {
    version: NOUS_MODEL_PREFERENCES_VERSION,
    savedAt: now,
    localOnly: true,
    cloudUsed: false,
    modules: sanitizeModules(modules),
  };
}

export function deserializeModelPreferences(raw: string | null, now = Date.now()): NousModelPreferencesDocument {
  if (typeof raw !== "string" || raw.trim().length === 0) return createModelPreferencesDocument({}, now);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createModelPreferencesDocument({}, now);
  }
  const doc = parsed as Partial<NousModelPreferencesDocument> | null;
  if (
    !doc ||
    doc.version !== NOUS_MODEL_PREFERENCES_VERSION ||
    doc.localOnly !== true ||
    doc.cloudUsed !== false ||
    !doc.modules ||
    typeof doc.modules !== "object"
  ) {
    return createModelPreferencesDocument({}, now);
  }
  return createModelPreferencesDocument(doc.modules, typeof doc.savedAt === "number" ? doc.savedAt : now);
}

export function serializeModelPreferences(doc: NousModelPreferencesDocument, now = Date.now()): string {
  return JSON.stringify(createModelPreferencesDocument(doc.modules, now));
}

export function loadModelPreferences(storage: Pick<Storage, "getItem">): NousModelPreferencesDocument {
  try {
    return deserializeModelPreferences(storage.getItem(NOUS_MODEL_PREFERENCES_KEY));
  } catch {
    return createModelPreferencesDocument();
  }
}

export function saveModelPreferences(
  storage: Pick<Storage, "setItem">,
  doc: NousModelPreferencesDocument,
): void {
  try {
    storage.setItem(NOUS_MODEL_PREFERENCES_KEY, serializeModelPreferences(doc));
  } catch {
    // Browser storage should never break a local workflow.
  }
}

export function resetModelPreferences(
  storage: Pick<Storage, "removeItem">,
  now = Date.now(),
): NousModelPreferencesDocument {
  try {
    storage.removeItem(NOUS_MODEL_PREFERENCES_KEY);
  } catch {
    // Ignore storage failures; caller still gets a fresh in-memory document.
  }
  return createModelPreferencesDocument({}, now);
}

export function setModuleModelPreference(
  doc: NousModelPreferencesDocument,
  moduleId: NousPreferenceModuleId,
  role: NousModelRole,
  model: string,
  now = Date.now(),
): NousModelPreferencesDocument {
  const cleaned = sanitizeModelName(model);
  const current = doc.modules[moduleId] ?? {};
  const nextModule = { ...current };
  if (cleaned.length > 0) {
    nextModule[role] = cleaned;
  } else {
    delete nextModule[role];
  }
  return createModelPreferencesDocument(
    {
      ...doc.modules,
      [moduleId]: nextModule,
    },
    now,
  );
}

export function resolveColloquiumChatModel(args: {
  preferences: NousModelPreferencesDocument;
  models: readonly LocalModelInfo[];
  configuredModel?: string;
}): string {
  const configuredFallback = chooseDefaultModel({
    configuredModel: args.configuredModel ?? "",
    models: args.models,
  });
  return resolveModelFromCandidates({
    models: args.models,
    candidates: [
      args.preferences.modules.colloquium?.chatModel,
      configuredFallback,
    ],
  });
}

export function resolveOculusVisionModel(args: {
  preferences: NousModelPreferencesDocument;
  models: readonly LocalModelInfo[];
  configuredModel?: string;
}): string {
  const preferred = resolveModelFromCandidates({
    models: args.models,
    candidates: [args.preferences.modules.oculus?.visionModel],
  });
  if (preferred.length > 0) return preferred;

  const configured = sanitizeModelName(args.configuredModel ?? "");
  if (configured.length > 0 && args.models.some((model) => model.name === configured)) {
    return configured;
  }
  return args.models.find((model) => isLikelyVisionModel(model.name))?.name ?? args.models[0]?.name ?? "";
}

export function resolveFabricaBuildModel(args: {
  preferences: NousModelPreferencesDocument;
  models: readonly LocalModelInfo[];
  configuredModel?: string;
}): string {
  const configuredFallback = chooseDefaultModel({
    configuredModel: args.configuredModel ?? "",
    models: args.models,
  });
  return resolveModelFromCandidates({
    models: args.models,
    candidates: [
      args.preferences.modules.fabrica?.buildModel,
      args.preferences.modules.colloquium?.chatModel,
      configuredFallback,
    ],
  });
}

export function isKnownLocalModel(modelName: string, models: readonly LocalModelInfo[]): boolean {
  const cleaned = sanitizeModelName(modelName);
  return cleaned.length > 0 && models.some((model) => model.name === cleaned);
}

export function explainSelectedModelSource(args: {
  selectedModel: string;
  models: readonly LocalModelInfo[];
  preferenceModel?: string;
  configuredModel?: string;
  pageSelection?: boolean;
  moduleLabel: string;
}): ModelSourceExplanation {
  const selected = sanitizeModelName(args.selectedModel);
  const preference = sanitizeModelName(args.preferenceModel ?? "");
  const configured = sanitizeModelName(args.configuredModel ?? "");
  if (selected.length === 0 || args.models.length === 0) {
    return {
      kind: "unavailable",
      message: "No local model is selected yet.",
    };
  }
  if (args.pageSelection) {
    return {
      kind: "fromPageSelection",
      message: `This is now your ${args.moduleLabel} preference.`,
    };
  }
  if (preference.length > 0 && selected === preference && isKnownLocalModel(preference, args.models)) {
    return {
      kind: "fromNousPreference",
      message: `Using your Nous preference for ${args.moduleLabel}.`,
    };
  }
  if (configured.length > 0 && isConfiguredModelMatch(configured, selected, args.models)) {
    return {
      kind: "fallbackDefault",
      message: selected === configured
        ? "Using the configured local default model."
        : "Using an installed variant of the configured local default model.",
    };
  }
  return {
    kind: "fallbackFirstDiscovered",
    message: "Using the first discovered local model.",
  };
}

function resolveModelFromCandidates(args: {
  models: readonly LocalModelInfo[];
  candidates: readonly (string | undefined)[];
}): string {
  for (const candidate of args.candidates) {
    const cleaned = sanitizeModelName(candidate ?? "");
    if (cleaned.length > 0 && args.models.some((model) => model.name === cleaned)) {
      return cleaned;
    }
  }
  return "";
}

function isConfiguredModelMatch(
  configured: string,
  selected: string,
  models: readonly LocalModelInfo[],
): boolean {
  return isKnownLocalModel(selected, models) && (selected === configured || selected.startsWith(`${configured}:`));
}

function sanitizeModules(
  modules: Partial<Record<NousPreferenceModuleId, NousModuleModelPreferences>>,
): Partial<Record<NousPreferenceModuleId, NousModuleModelPreferences>> {
  const next: Partial<Record<NousPreferenceModuleId, NousModuleModelPreferences>> = {};
  for (const moduleId of ["colloquium", "oculus", "fabrica"] as const) {
    const modulePrefs = modules[moduleId];
    if (!modulePrefs || typeof modulePrefs !== "object") continue;
    const cleaned: NousModuleModelPreferences = {};
    const chatModel = sanitizeModelName(modulePrefs.chatModel ?? "");
    const visionModel = sanitizeModelName(modulePrefs.visionModel ?? "");
    const buildModel = sanitizeModelName(modulePrefs.buildModel ?? "");
    if (chatModel) cleaned.chatModel = chatModel;
    if (visionModel) cleaned.visionModel = visionModel;
    if (buildModel) cleaned.buildModel = buildModel;
    if (Object.keys(cleaned).length > 0) next[moduleId] = cleaned;
  }
  return next;
}

function sanitizeModelName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160);
}
