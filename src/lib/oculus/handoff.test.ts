import { describe, expect, it, vi } from "vitest";
import {
  OCULUS_HANDOFF_TTL_MS,
  OCULUS_TO_COLLOQUIUM_HANDOFF_KEY,
  consumeOculusToColloquiumHandoff,
  createOculusToColloquiumPayload,
  parseOculusToColloquiumPayload,
  saveOculusToColloquiumHandoff,
} from "./handoff";

describe("Oculus handoff", () => {
  it("creates text-only local handoff payloads", () => {
    const payload = createOculusToColloquiumPayload("analysis", 100);
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
    expect(parseOculusToColloquiumPayload("{bad", 1)).toBeNull();
    expect(
      parseOculusToColloquiumPayload(
        JSON.stringify(createOculusToColloquiumPayload("analysis", 1)),
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
    expect(saveOculusToColloquiumHandoff(storage, "analysis", 100)).toBe(true);
    expect(storage.setItem.mock.calls[0][0]).toBe(OCULUS_TO_COLLOQUIUM_HANDOFF_KEY);
    expect(consumeOculusToColloquiumHandoff(storage, 101)?.analysisText).toBe("analysis");
    expect(data.has(OCULUS_TO_COLLOQUIUM_HANDOFF_KEY)).toBe(false);
  });
});
