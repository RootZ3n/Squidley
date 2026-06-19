import { describe, it, expect } from "vitest";
import {
  createRunningReceipt,
  failReceipt,
  receiptDurationMs,
  succeedReceipt,
  upsertReceipt,
} from "./receipts";

describe("receipts", () => {
  it("createRunningReceipt records local provider, no cloud, no tools", () => {
    const r = createRunningReceipt({ id: "r1", model: "llama3.2", startedAt: 1000 });
    expect(r.provider).toBe("local");
    expect(r.status).toBe("running");
    expect(r.cloudUsed).toBe(false);
    expect(r.toolsUsed).toBe(false);
    expect(r.completedAt).toBeUndefined();
  });

  it("succeedReceipt marks status and completedAt", () => {
    const r = createRunningReceipt({ id: "r1", model: "m", startedAt: 1000 });
    const done = succeedReceipt(r, 1250);
    expect(done.status).toBe("succeeded");
    expect(done.completedAt).toBe(1250);
    expect(done.cloudUsed).toBe(false);
  });

  it("failReceipt records a friendly error and never flips cloudUsed", () => {
    const r = createRunningReceipt({ id: "r1", model: "m", startedAt: 1000 });
    const f = failReceipt(r, 1100, "Local server unreachable.");
    expect(f.status).toBe("failed");
    expect(f.errorMessage).toBe("Local server unreachable.");
    expect(f.cloudUsed).toBe(false);
    expect(f.toolsUsed).toBe(false);
  });

  it("receiptDurationMs returns undefined while running, ms when done", () => {
    const r = createRunningReceipt({ id: "r1", model: "m", startedAt: 1000 });
    expect(receiptDurationMs(r)).toBeUndefined();
    const done = succeedReceipt(r, 1250);
    expect(receiptDurationMs(done)).toBe(250);
  });

  it("receiptDurationMs clamps negative deltas to 0", () => {
    const r = createRunningReceipt({ id: "r1", model: "m", startedAt: 2000 });
    const odd = succeedReceipt(r, 1000);
    expect(receiptDurationMs(odd)).toBe(0);
  });

  it("upsertReceipt appends a new receipt", () => {
    const r = createRunningReceipt({ id: "r1", model: "m", startedAt: 1 });
    const list = upsertReceipt([], r);
    expect(list).toHaveLength(1);
  });

  it("upsertReceipt replaces an existing receipt by id without re-ordering", () => {
    const a = createRunningReceipt({ id: "a", model: "m", startedAt: 1 });
    const b = createRunningReceipt({ id: "b", model: "m", startedAt: 2 });
    const list = upsertReceipt(upsertReceipt([], a), b);
    const updated = succeedReceipt(a, 100);
    const next = upsertReceipt(list, updated);
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(updated);
    expect(next[1]).toBe(b);
  });
});
