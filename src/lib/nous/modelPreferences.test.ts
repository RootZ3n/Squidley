import { describe, expect, it } from "vitest";
import {
  NOUS_MODEL_PREFERENCES_KEY,
  createModelPreferencesDocument,
  deserializeModelPreferences,
  loadModelPreferences,
  resetModelPreferences,
  explainSelectedModelSource,
  resolveColloquiumChatModel,
  resolveFabricaBuildModel,
  resolveOculusVisionModel,
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

describe("Nous model preferences", () => {
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
    expect(storage.getItem(NOUS_MODEL_PREFERENCES_KEY)).toContain('"cloudUsed":false');
    resetModelPreferences(storage, 3);
    expect(loadModelPreferences(storage).modules).toEqual({});
  });

  it("resolves Colloquium preference, configured model, then first local model", () => {
    const preferred = setModuleModelPreference(
      createModelPreferencesDocument(),
      "colloquium",
      "chatModel",
      "qwen2.5:3b",
    );
    expect(resolveColloquiumChatModel({ preferences: preferred, models, configuredModel: "llama3.2" })).toBe("qwen2.5:3b");
    expect(resolveColloquiumChatModel({ preferences: createModelPreferencesDocument(), models, configuredModel: "llama3.2" })).toBe("llama3.2");
    expect(resolveColloquiumChatModel({ preferences: createModelPreferencesDocument(), models, configuredModel: "missing" })).toBe("llama3.2");
  });

  it("resolves Colloquium to an installed configured-model variant before unrelated first models", () => {
    expect(resolveColloquiumChatModel({
      preferences: createModelPreferencesDocument(),
      models: [
        { name: "all-minilm:latest", displayName: "all-minilm latest" },
        { name: "llama3.2:3b", displayName: "llama3.2 3b" },
      ],
      configuredModel: "llama3.2",
    })).toBe("llama3.2:3b");
  });

  it("resolves Oculus to a selected or likely vision model", () => {
    const preferred = setModuleModelPreference(createModelPreferencesDocument(), "oculus", "visionModel", "llava:latest");
    expect(resolveOculusVisionModel({ preferences: preferred, models, configuredModel: "llama3.2" })).toBe("llava:latest");
    expect(resolveOculusVisionModel({ preferences: createModelPreferencesDocument(), models, configuredModel: "llama3.2" })).toBe("llama3.2");
    expect(resolveOculusVisionModel({ preferences: createModelPreferencesDocument(), models: models.filter((m) => m.name !== "llama3.2"), configuredModel: "missing" })).toBe("llava:latest");
  });

  it("keeps Fabrica model assignment prepared without enabling cloud", () => {
    const preferred = setModuleModelPreference(createModelPreferencesDocument(), "fabrica", "buildModel", "qwen2.5:3b");
    expect(resolveFabricaBuildModel({ preferences: preferred, models, configuredModel: "llama3.2" })).toBe("qwen2.5:3b");
    expect(preferred.cloudUsed).toBe(false);
  });

  it("falls Fabrica back to the Colloquium local preference when no Fabrica model is saved", () => {
    const prefs = setModuleModelPreference(createModelPreferencesDocument(), "colloquium", "chatModel", "qwen2.5:3b");
    expect(resolveFabricaBuildModel({ preferences: prefs, models, configuredModel: "llama3.2" })).toBe("qwen2.5:3b");
  });

  it("explains selected model source for beginner-facing notes", () => {
    expect(
      explainSelectedModelSource({
        selectedModel: "qwen2.5:3b",
        preferenceModel: "qwen2.5:3b",
        configuredModel: "llama3.2",
        models,
        moduleLabel: "Colloquium",
      }),
    ).toMatchObject({ kind: "fromNousPreference" });
    expect(
      explainSelectedModelSource({
        selectedModel: "llama3.2",
        configuredModel: "llama3.2",
        models,
        moduleLabel: "Colloquium",
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
        moduleLabel: "Colloquium",
      }),
    ).toMatchObject({
      kind: "fallbackDefault",
      message: "Using an installed variant of the configured local default model.",
    });
    expect(
      explainSelectedModelSource({
        selectedModel: "qwen2.5:3b",
        models,
        moduleLabel: "Colloquium",
        pageSelection: true,
      }),
    ).toMatchObject({ kind: "fromPageSelection" });
    expect(
      explainSelectedModelSource({
        selectedModel: "",
        models: [],
        moduleLabel: "Oculus vision",
      }),
    ).toMatchObject({ kind: "unavailable" });
  });
});
