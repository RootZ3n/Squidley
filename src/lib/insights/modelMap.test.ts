import { describe, expect, it } from "vitest";
import { createModelPreferencesDocument, setModuleModelPreference } from "./modelPreferences";
import { buildInsightsModuleMap } from "./modelMap";

const models = [
  { name: "llama3.2", displayName: "llama3.2" },
  { name: "llava:latest", displayName: "llava latest" },
];

describe("Insights module map", () => {
  it("describes public modules and model roles", () => {
    const prefs = setModuleModelPreference(
      setModuleModelPreference(createModelPreferencesDocument(), "colloquium", "chatModel", "llama3.2"),
      "oculus",
      "visionModel",
      "llava:latest",
    );
    const map = buildInsightsModuleMap({ preferences: prefs, models, configuredModel: "llama3.2" });

    expect(map.find((item) => item.moduleId === "colloquium")).toMatchObject({
      usesModel: true,
      modelRole: "chat",
      selectedProvider: "ollama",
      selectedModel: "llama3.2",
      currentStatus: "active",
      cloudUnlockRequired: false,
    });
    expect(map.find((item) => item.moduleId === "oculus")).toMatchObject({
      usesModel: true,
      modelRole: "vision",
      selectedModel: "llava:latest",
    });
    expect(map.find((item) => item.moduleId === "velum")).toMatchObject({
      usesModel: false,
      modelRole: "none",
      currentStatus: "local-only",
    });
  });

  it("marks Workshop as an active single-file workshop without agent behavior", () => {
    const fabrica = buildInsightsModuleMap({
      preferences: createModelPreferencesDocument(),
      models,
      configuredModel: "llama3.2",
    }).find((item) => item.moduleId === "fabrica");

    expect(fabrica).toMatchObject({
      usesModel: true,
      modelRole: "build",
      currentStatus: "active",
      selectedProvider: "ollama",
    });
    expect(fabrica?.explanation.toLowerCase()).toContain("single-file");
    expect(fabrica?.explanation.toLowerCase()).toContain("does not write files");
  });

  it("does not mark any public map entry as currently using cloud", () => {
    const map = buildInsightsModuleMap({
      preferences: createModelPreferencesDocument(),
      models,
      configuredModel: "llama3.2",
    });
    expect(map.every((item) => item.selectedProvider === "ollama" || item.selectedProvider === "none")).toBe(true);
  });
});
