import { describe, expect, it, vi } from "vitest";
import {
  OCULUS_HANDOFF_TTL_MS,
  VISION_TO_CHAT_HANDOFF_KEY,
  consumeVisionToChatHandoff,
  createVisionToChatPayload,
  parseVisionToChatPayload,
  saveVisionToChatHandoff,
} from "./handoff";

describe("Vision handoff", () => {
  it("creates text-only local handoff payloads", () => {
    const payload = createVisionToChatPayload("analysis", 100);
    expect(payload).toEqual({
      version: 1,
      createdAt: 100,
      source: "oculus",
      target: "colloquium",
      localOnly: true,
      cloudUsed: false,
      imageIncluded: false,
      analysisText: "analysis",
    });
    expect(JSON.stringify(payload)).not.toContain("data:image");
  });

  it("validates malformed and expired payloads", () => {
    expect(parseVisionToChatPayload("{bad", 1)).toBeNull();
    expect(
      parseVisionToChatPayload(
        JSON.stringify(createVisionToChatPayload("analysis", 1)),
        1 + OCULUS_HANDOFF_TTL_MS + 1,
      ),
    ).toBeNull();
  });

  it("saves and consumes once", () => {
    const data = new Map<string, string>();
    const storage = {
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      removeItem: vi.fn((key: string) => data.delete(key)),
    };
    expect(saveVisionToChatHandoff(storage, "analysis", 100)).toBe(true);
    expect(storage.setItem.mock.calls[0][0]).toBe(VISION_TO_CHAT_HANDOFF_KEY);
    expect(consumeVisionToChatHandoff(storage, 101)?.analysisText).toBe("analysis");
    expect(data.has(VISION_TO_CHAT_HANDOFF_KEY)).toBe(false);
  });
});
