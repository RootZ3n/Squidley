import { describe, expect, it } from "vitest";
import {
  getModelReadiness,
  resolveModelSelection,
} from "./readiness";

const models = [
  { name: "llama3.2", displayName: "llama3.2" },
  { name: "qwen2.5:3b", displayName: "qwen2.5 3b" },
];

describe("resolveModelSelection", () => {
  it("keeps the current selected model when it still exists", () => {
    expect(
      resolveModelSelection({
        models,
        currentModel: "qwen2.5:3b",
        preferredModel: "llama3.2",
      }),
    ).toEqual({ selectedModel: "qwen2.5:3b" });
  });

  it("uses the configured preferred model when there is no current model", () => {
    expect(
      resolveModelSelection({
        models,
        currentModel: "",
        preferredModel: "llama3.2",
      }),
    ).toEqual({ selectedModel: "llama3.2" });
  });

  it("falls back to the first model when the preferred model is missing", () => {
    expect(
      resolveModelSelection({
        models,
        currentModel: "",
        preferredModel: "missing",
      }),
    ).toEqual({ selectedModel: "llama3.2" });
  });

  it("prefers an installed configured-model variant over an embedding model", () => {
    expect(
      resolveModelSelection({
        models: [
          { name: "all-minilm:latest", displayName: "all-minilm latest" },
          { name: "llama3.2:3b", displayName: "llama3.2 3b" },
        ],
        currentModel: "",
        preferredModel: "llama3.2",
      }),
    ).toEqual({ selectedModel: "llama3.2:3b" });
  });

  it("reports when the selected model disappeared after refresh", () => {
    const resolved = resolveModelSelection({
      models,
      currentModel: "old-model",
      preferredModel: "llama3.2",
    });

    expect(resolved.selectedModel).toBe("llama3.2");
    expect(resolved.note).toMatch(/old-model/);
  });

  it("clears selection when no models are available", () => {
    expect(
      resolveModelSelection({
        models: [],
        currentModel: "llama3.2",
        preferredModel: "llama3.2",
      }),
    ).toEqual({
      selectedModel: "",
      note: 'The selected model "llama3.2" is no longer available.',
    });
  });
});

describe("getModelReadiness", () => {
  it("disables send while refreshing", () => {
    expect(
      getModelReadiness({
        healthStatus: "ready",
        models,
        selectedModel: "llama3.2",
        refreshInProgress: true,
        streamingInProgress: false,
      }),
    ).toMatchObject({ kind: "refreshing", canSend: false });
  });

  it("disables send while streaming", () => {
    expect(
      getModelReadiness({
        healthStatus: "ready",
        models,
        selectedModel: "llama3.2",
        refreshInProgress: false,
        streamingInProgress: true,
      }),
    ).toMatchObject({ kind: "streaming", canSend: false });
  });

  it("distinguishes unavailable server from empty models", () => {
    expect(
      getModelReadiness({
        healthStatus: "unavailable",
        models: [],
        selectedModel: "",
        refreshInProgress: false,
        streamingInProgress: false,
      }).kind,
    ).toBe("server-unavailable");

    expect(
      getModelReadiness({
        healthStatus: "ready",
        models: [],
        selectedModel: "",
        refreshInProgress: false,
        streamingInProgress: false,
      }).kind,
    ).toBe("no-models");
  });

  it("enables send only when a selected local model exists", () => {
    expect(
      getModelReadiness({
        healthStatus: "ready",
        models,
        selectedModel: "llama3.2",
        refreshInProgress: false,
        streamingInProgress: false,
      }),
    ).toMatchObject({ kind: "ready", canSend: true });

    expect(
      getModelReadiness({
        healthStatus: "ready",
        models,
        selectedModel: "missing",
        refreshInProgress: false,
        streamingInProgress: false,
      }),
    ).toMatchObject({ kind: "selected-model-missing", canSend: false });
  });
});
