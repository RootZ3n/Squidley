import { describe, it, expect } from "vitest";
import {
  packContext,
  renderPackedContext,
  type ContextItem,
} from "@/lib/reliability/contextPacker";

const tiny = (body: string, id = "tiny"): ContextItem => ({
  id,
  kind: "snippet",
  label: id,
  body,
});

describe("reliability/contextPacker", () => {
  it("admits high-priority snippets before low-priority filler", () => {
    const items: ContextItem[] = [
      { id: "filler", kind: "other", label: "filler", body: "x".repeat(2000) },
      { id: "hot", kind: "snippet", label: "hot", body: "y".repeat(200) },
    ];
    const packed = packContext(items, { maxChars: 500 });
    const ids = packed.includedItems.map((p) => p.id);
    expect(ids[0]).toBe("hot");
  });

  it("never silently inlines an oversized file", () => {
    const items: ContextItem[] = [
      { id: "huge", kind: "snippet", label: "huge.ts", body: "z".repeat(200_000) },
    ];
    const packed = packContext(items, { maxChars: 2000 });
    expect(packed.includedItems.length).toBe(0);
    expect(packed.omittedItems[0]?.reason).toBe("too-large-to-truncate");
    expect(packed.truncationNotes.length).toBeGreaterThan(0);
  });

  it("truncates with a visible note rather than silently dropping content", () => {
    const long = "a".repeat(5000);
    const packed = packContext([tiny(long, "long")], {
      maxChars: 1500,
      maxItemChars: 1000,
    });
    expect(packed.includedItems[0].truncated).toBe(true);
    expect(packed.includedItems[0].body).toMatch(/chars omitted/);
    expect(packed.truncationNotes.length).toBeGreaterThan(0);
  });

  it("does not silently drop the middle — both head and tail are preserved", () => {
    const body = "HEAD" + "m".repeat(2000) + "TAIL";
    const packed = packContext([tiny(body, "headtail")], {
      maxChars: 1000,
      maxItemChars: 800,
    });
    const out = packed.includedItems[0].body;
    expect(out.startsWith("HEAD")).toBe(true);
    expect(out.endsWith("TAIL")).toBe(true);
    expect(out).toMatch(/middle truncated/);
  });

  it("discloses every omitted item by id and reason", () => {
    const items: ContextItem[] = [
      { id: "fits", kind: "snippet", label: "fits", body: "ok" },
      { id: "empty", kind: "snippet", label: "empty", body: "   " },
      { id: "big", kind: "snippet", label: "big", body: "x".repeat(200_000) },
    ];
    const packed = packContext(items, { maxChars: 1000 });
    const reasons = packed.omittedItems.map((o) => o.reason);
    expect(reasons).toContain("empty");
    expect(reasons).toContain("too-large-to-truncate");
  });

  it("flags safeForLocalModel=false above the hard limit", () => {
    const items = Array.from({ length: 20 }, (_, i) => tiny("y".repeat(500), `s${i}`));
    const packed = packContext(items, { maxChars: 20_000, maxItemChars: 600 });
    expect(packed.estimatedSize).toBeGreaterThan(8000);
    expect(packed.safeForLocalModel).toBe(false);
  });

  it("packs within budget and reports estimated size", () => {
    const items = Array.from({ length: 5 }, (_, i) => tiny("y".repeat(200), `s${i}`));
    const packed = packContext(items, { maxChars: 700, maxItemChars: 200 });
    expect(packed.estimatedSize).toBeLessThanOrEqual(700);
    expect(packed.safeForLocalModel).toBe(true);
  });

  it("renderPackedContext discloses omissions in the rendered string", () => {
    const items: ContextItem[] = [
      { id: "kept", kind: "snippet", label: "kept.ts", body: "function a(){}" },
      { id: "drop", kind: "snippet", label: "drop.ts", body: "x".repeat(200_000) },
    ];
    const packed = packContext(items, { maxChars: 1000 });
    const rendered = renderPackedContext(packed);
    expect(rendered).toMatch(/Omitted for honesty/);
    expect(rendered).toMatch(/drop\.ts/);
  });

  it("stable order between items of equal priority", () => {
    const items: ContextItem[] = [
      { id: "a", kind: "snippet", label: "a", body: "1" },
      { id: "b", kind: "snippet", label: "b", body: "2" },
      { id: "c", kind: "snippet", label: "c", body: "3" },
    ];
    const packed = packContext(items, { maxChars: 1000 });
    expect(packed.includedItems.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
