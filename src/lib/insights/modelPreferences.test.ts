import { describe, expect, it } from "vitest";
import {
  INSIGHTS_MODEL_PREFERENCES_KEY,
  createModelPreferencesDocument,
  deserializeModelPreferences,
  loadModelPreferences,
  resetModelPreferences,
  explainSelectedModelSource,
  resolveChatModel,
  resolveWorkshopBuildModel,
  resolveVisionVisionModel,
  saveModelPreferences,
  setModuleModelPreference,
} from "./modelPreferences";

const models = [
  { name: "llama3.2", displayName: "llama3.2" },
  { name: "llava:latest", displayName: "llava latest" },
  { name: "qwen2.5:3b", displayName: "qwen2.5 3b" },
];

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("Insights model preferences", () => {
  it("defaults to browser-local metadata with cloud off", () => {
    expect(createModelPreferencesDocument({}, 1)).toEqual({
      version: 1,
      savedAt: 1,
      localOnly: true,
      cloudUsed: false,
      modules: {},
    });
  });

  it("ignores malformed or unsupported storage", () => {
    expect(deserializeModelPreferences("{nope")).toMatchObject({ modules: {} });
    expect(deserializeModelPreferences(JSON.stringify({ version: 99, modules: {} }))).toMatchObject({
      modules: {},
      localOnly: true,
      cloudUsed: false,
    });
  });

  it("stores and resets module-local model choices", () => {
    const storage = new MemoryStorage();
    const doc = setModuleModelPreference(
      createModelPreferencesDocument({}, 1),
      "colloquium",
      "chatModel",
      " llama3.2 ",
      2,
    );
    saveModelPreferences(storage, doc);
    expect(loadModelPreferences(storage).modules.colloquium?.chatModel).toBe("llama3.2");
    expect(storage.getItem(INSIGHTS_MODEL_PREFERENCES_KEY)).toContain('"cloudUsed":false');
    resetModelPreferences(storage, 3);
    expect(loadModelPreferences(storage).modules).toEqual({});
  });

  it("resolves Chat preference, configured model, then first local model", () => {
    const preferred = setModuleModelPreference(
      createModelPreferencesDocument(),
      "colloquium",
      "chatModel",
      "qwen2.5:3b",
    );
    expect(resolveChatModel({ preferences: preferred, models, configuredModel: "llama3.2" })).toBe("qwen2.5:3b");
    expect(resolveChatModel({ preferences: createModelPreferencesDocument(), models, configuredModel: "llama3.2" })).toBe("llama3.2");
    expect(resolveChatModel({ preferences: createModelPreferencesDocument(), models, configuredModel: "missing" })).toBe("llama3.2");
  });

  it("resolves Chat to an installed configured-model variant before unrelated first models", () => {
    expect(resolveChatModel({
      preferences: createModelPreferencesDocument(),
      models: [
        { name: "all-minilm:latest", displayName: "all-minilm latest" },
        { name: "llama3.2:3b", displayName: "llama3.2 3b" },
      ],
      configuredModel: "llama3.2",
    })).toBe("llama3.2:3b");
  });

  it("resolves Vision to a selected or likely vision model", () => {
    const preferred = setModuleModelPreference(createModelPreferencesDocument(), "oculus", "visionModel", "llava:latest");
    expect(resolveVisionVisionModel({ preferences: preferred, models, configuredModel: "llama3.2" })).toBe("llava:latest");
    expect(resolveVisionVisionModel({ preferences: createModelPreferencesDocument(), models, configuredModel: "llama3.2" })).toBe("llama3.2");
    expect(resolveVisionVisionModel({ preferences: createModelPreferencesDocument(), models: models.filter((m) => m.name !== "llama3.2"), configuredModel: "missing" })).toBe("llava:latest");
  });

  it("keeps Workshop model assignment prepared without enabling cloud", () => {
    const preferred = setModuleModelPreference(createModelPreferencesDocument(), "fabrica", "buildModel", "qwen2.5:3b");
    expect(resolveWorkshopBuildModel({ preferences: preferred, models, configuredModel: "llama3.2" })).toBe("qwen2.5:3b");
    expect(preferred.cloudUsed).toBe(false);
  });

  it("falls Workshop back to the Chat local preference when no Workshop model is saved", () => {
    const prefs = setModuleModelPreference(createModelPreferencesDocument(), "colloquium", "chatModel", "qwen2.5:3b");
    expect(resolveWorkshopBuildModel({ preferences: prefs, models, configuredModel: "llama3.2" })).toBe("qwen2.5:3b");
  });

  it("explains selected model source for beginner-facing notes", () => {
    expect(
      explainSelectedModelSource({
        selectedModel: "qwen2.5:3b",
        preferenceModel: "qwen2.5:3b",
        configuredModel: "llama3.2",
        models,
        moduleLabel: "Chat",
      }),
    ).toMatchObject({ kind: "fromInsightsPreference" });
    expect(
      explainSelectedModelSource({
        selectedModel: "llama3.2",
        configuredModel: "llama3.2",
        models,
        moduleLabel: "Chat",
      }),
    ).toMatchObject({ kind: "fallbackDefault" });
    expect(
      explainSelectedModelSource({
        selectedModel: "llama3.2:3b",
        configuredModel: "llama3.2",
        models: [
          { name: "all-minilm:latest", displayName: "all-minilm latest" },
          { name: "llama3.2:3b", displayName: "llama3.2 3b" },
        ],
        moduleLabel: "Chat",
      }),
    ).toMatchObject({
      kind: "fallbackDefault",
      message: "Using an installed variant of the configured local default model.",
    });
    expect(
      explainSelectedModelSource({
        selectedModel: "qwen2.5:3b",
        models,
        moduleLabel: "Chat",
        pageSelection: true,
      }),
    ).toMatchObject({ kind: "fromPageSelection" });
    expect(
      explainSelectedModelSource({
        selectedModel: "",
        models: [],
        moduleLabel: "Vision vision",
      }),
    ).toMatchObject({ kind: "unavailable" });
  });
});
