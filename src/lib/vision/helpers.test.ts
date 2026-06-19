import { describe, expect, it } from "vitest";
import {
  chooseVisionModel,
  formatFileSize,
  isAcceptedVisionImageType,
  isLikelyVisionModel,
  stripDataUrlPrefix,
} from "./helpers";

describe("Vision helpers", () => {
  it("accepts only common public image types", () => {
    expect(isAcceptedVisionImageType("image/png")).toBe(true);
    expect(isAcceptedVisionImageType("image/jpeg")).toBe(true);
    expect(isAcceptedVisionImageType("image/webp")).toBe(true);
    expect(isAcceptedVisionImageType("image/svg+xml")).toBe(false);
    expect(isAcceptedVisionImageType("text/plain")).toBe(false);
  });

  it("formats file sizes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("detects likely vision model names without overclaiming", () => {
    expect(isLikelyVisionModel("llava:latest")).toBe(true);
    expect(isLikelyVisionModel("minicpm-v:8b")).toBe(true);
    expect(isLikelyVisionModel("moondream")).toBe(true);
    expect(isLikelyVisionModel("qwen3-vl:4b")).toBe(true);
    expect(isLikelyVisionModel("llama3.2")).toBe(false);
  });

  it("chooses a likely vision model when available", () => {
    expect(chooseVisionModel({
      selectedModel: "llama3.2",
      configuredModel: "llama3.2",
      models: [{ name: "llava:latest", displayName: "llava latest" }],
    })).toBe("llava:latest");
  });

  it("strips data URL prefixes", () => {
    expect(stripDataUrlPrefix("data:image/png;base64,abc123")).toBe("abc123");
    expect(stripDataUrlPrefix("abc123")).toBe("abc123");
  });
});
