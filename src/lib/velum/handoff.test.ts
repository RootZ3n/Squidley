import { describe, expect, it, vi } from "vitest";
import {
  COLLOQUIUM_TO_VELUM_HANDOFF_KEY,
  MORE_INPUT_TO_VELUM_HANDOFF_KEY,
  VELUM_TO_MORE_INPUT_HANDOFF_KEY,
  VELUM_HANDOFF_KEY,
  VELUM_HANDOFF_MAX_CHARS,
  VELUM_HANDOFF_TTL_MS,
  consumeColloquiumToVelumHandoff,
  consumeMoreInputToVelumHandoff,
  consumeVelumToMoreInputHandoff,
  consumeVelumHandoff,
  createMoreInputToVelumPayload,
  createVelumToMoreInputPayload,
  createColloquiumToVelumPayload,
  createVelumHandoffPayload,
  mergeVelumDraft,
  parseColloquiumToVelumPayload,
  parseMoreInputToVelumPayload,
  parseVelumToMoreInputPayload,
  parseVelumHandoffPayload,
  saveColloquiumToVelumHandoff,
  saveMoreInputToVelumHandoff,
  saveVelumToMoreInputHandoff,
  saveVelumHandoff,
} from "./handoff";

describe("Velum handoff payloads", () => {
  it("creates a local-only payload with only redacted text", () => {
    const payload = createVelumHandoffPayload("[REDACTED_EMAIL]", 1000);
    expect(payload).toMatchObject({
      version: 1,
      createdAt: 1000,
      source: "velum",
      localOnly: true,
      cloudUsed: false,
      originalIncluded: false,
      redactedText: "[REDACTED_EMAIL]",
    });
    expect(JSON.stringify(payload)).not.toContain("person@example.com");
  });

  it("rejects malformed and expired payloads", () => {
    expect(parseVelumHandoffPayload("{bad", 1000)).toBeNull();
    expect(
      parseVelumHandoffPayload(
        JSON.stringify(createVelumHandoffPayload("safe", 1000)),
        1000 + VELUM_HANDOFF_TTL_MS + 1,
      ),
    ).toBeNull();
  });

  it("rejects overlarge handoff text", () => {
    expect(
      parseVelumHandoffPayload(
        JSON.stringify({
          version: 1,
          createdAt: 1000,
          source: "velum",
          localOnly: true,
          cloudUsed: false,
          originalIncluded: false,
          redactedText: "x".repeat(VELUM_HANDOFF_MAX_CHARS + 1),
        }),
        1001,
      ),
    ).toBeNull();
  });

  it("saves and consumes handoff while clearing storage", () => {
    const data = new Map<string, string>();
    const storage = {
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      removeItem: vi.fn((key: string) => data.delete(key)),
    };

    expect(saveVelumHandoff(storage, "[REDACTED_PHONE]", 100)).toBe(true);
    expect(storage.setItem.mock.calls[0][0]).toBe(VELUM_HANDOFF_KEY);
    const consumed = consumeVelumHandoff(storage, 200);
    expect(consumed?.redactedText).toBe("[REDACTED_PHONE]");
    expect(storage.removeItem).toHaveBeenCalledWith(VELUM_HANDOFF_KEY);
    expect(data.has(VELUM_HANDOFF_KEY)).toBe(false);
  });

  it("merges imported drafts without silent overwrite", () => {
    expect(mergeVelumDraft({ existingDraft: "", importedDraft: "clean" })).toEqual({
      draft: "clean",
      note: "Redacted Velum draft imported. Review it, then click Send when you are ready.",
    });
    expect(
      mergeVelumDraft({ existingDraft: "existing", importedDraft: "clean" }).draft,
    ).toBe("existing\n\nclean");
  });
});

describe("More Input Velum handoffs", () => {
  it("creates and validates a More Input draft handoff", () => {
    const payload = createMoreInputToVelumPayload({
      draftText: "review this",
      title: "My note",
      entryType: "note",
      entryId: "entry-1",
      now: 100,
    });
    expect(payload).toMatchObject({
      version: 1,
      source: "more-input",
      localOnly: true,
      cloudUsed: false,
      modelUsed: false,
      draftText: "review this",
      title: "My note",
      entryType: "note",
      entryId: "entry-1",
    });
    expect(parseMoreInputToVelumPayload(JSON.stringify(payload), 101)).toEqual(payload);
  });

  it("rejects malformed and expired More Input draft handoffs", () => {
    expect(parseMoreInputToVelumPayload("{bad", 1)).toBeNull();
    expect(
      parseMoreInputToVelumPayload(
        JSON.stringify(createMoreInputToVelumPayload({ draftText: "x", now: 1 })),
        1 + VELUM_HANDOFF_TTL_MS + 1,
      ),
    ).toBeNull();
  });

  it("consumes More Input draft handoff once", () => {
    const data = new Map<string, string>();
    const storage = {
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      removeItem: vi.fn((key: string) => data.delete(key)),
    };
    expect(saveMoreInputToVelumHandoff(storage, { draftText: "x", now: 1 })).toBe(true);
    expect(storage.setItem.mock.calls[0][0]).toBe(MORE_INPUT_TO_VELUM_HANDOFF_KEY);
    expect(consumeMoreInputToVelumHandoff(storage, 2)?.draftText).toBe("x");
    expect(data.has(MORE_INPUT_TO_VELUM_HANDOFF_KEY)).toBe(false);
  });

  it("creates and consumes a redacted return to More Input with risk summary", () => {
    const data = new Map<string, string>();
    const storage = {
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      removeItem: vi.fn((key: string) => data.delete(key)),
    };
    const riskSummary = { overallRisk: "medium" as const, findingCount: 2, highestSeverity: "medium" as const };
    const payload = createVelumToMoreInputPayload({
      redactedText: "clean",
      title: "T",
      entryType: "article",
      entryId: "entry-1",
      riskSummary,
      now: 10,
    });
    expect(parseVelumToMoreInputPayload(JSON.stringify(payload), 11)?.riskSummary).toEqual(riskSummary);
    expect(parseVelumToMoreInputPayload(JSON.stringify(payload), 11)?.entryId).toBe("entry-1");
    expect(saveVelumToMoreInputHandoff(storage, { redactedText: "clean", riskSummary, now: 10 })).toBe(true);
    expect(storage.setItem.mock.calls[0][0]).toBe(VELUM_TO_MORE_INPUT_HANDOFF_KEY);
    expect(consumeVelumToMoreInputHandoff(storage, 11)?.redactedText).toBe("clean");
    expect(data.has(VELUM_TO_MORE_INPUT_HANDOFF_KEY)).toBe(false);
  });
});

describe("Colloquium to Velum handoff payloads", () => {
  it("creates a browser-local draft review payload without URL involvement", () => {
    const payload = createColloquiumToVelumPayload("draft with possible secret", 100);
    expect(payload).toEqual({
      version: 1,
      createdAt: 100,
      source: "colloquium",
      localOnly: true,
      cloudUsed: false,
      modelUsed: false,
      draftText: "draft with possible secret",
    });
  });

  it("validates version, expiry, and malformed data", () => {
    expect(parseColloquiumToVelumPayload("{bad", 100)).toBeNull();
    expect(
      parseColloquiumToVelumPayload(
        JSON.stringify({
          version: 2,
          createdAt: 100,
          source: "colloquium",
          localOnly: true,
          cloudUsed: false,
          modelUsed: false,
          draftText: "draft",
        }),
        101,
      ),
    ).toBeNull();
    expect(
      parseColloquiumToVelumPayload(
        JSON.stringify(createColloquiumToVelumPayload("draft", 100)),
        100 + VELUM_HANDOFF_TTL_MS + 1,
      ),
    ).toBeNull();
  });

  it("saves and consumes draft handoff once while clearing storage", () => {
    const data = new Map<string, string>();
    const storage = {
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      removeItem: vi.fn((key: string) => data.delete(key)),
    };

    expect(saveColloquiumToVelumHandoff(storage, "review me", 100)).toBe(true);
    expect(storage.setItem.mock.calls[0][0]).toBe(COLLOQUIUM_TO_VELUM_HANDOFF_KEY);
    const consumed = consumeColloquiumToVelumHandoff(storage, 200);
    expect(consumed?.draftText).toBe("review me");
    expect(storage.removeItem).toHaveBeenCalledWith(COLLOQUIUM_TO_VELUM_HANDOFF_KEY);
    expect(data.has(COLLOQUIUM_TO_VELUM_HANDOFF_KEY)).toBe(false);
  });

  it("keeps Velum-to-Colloquium redacted handoff unchanged", () => {
    const payload = createVelumHandoffPayload("[REDACTED_SECRET]", 500);
    expect(payload?.source).toBe("velum");
    expect(payload).toHaveProperty("redactedText", "[REDACTED_SECRET]");
    expect(payload).not.toHaveProperty("draftText");
  });
});
