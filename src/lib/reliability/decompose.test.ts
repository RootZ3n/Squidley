import { describe, it, expect } from "vitest";
import { buildFailureSignature, decomposeTask } from "@/lib/reliability/decompose";
import { createSmallModelTask } from "@/lib/reliability/types";

describe("reliability/decompose", () => {
  it("buildFailureSignature is stable across noise", () => {
    const a = buildFailureSignature(
      "Error: ECONNREFUSED 127.0.0.1:11434 at /tmp/abc123/index.js:42:10",
    );
    const b = buildFailureSignature(
      "Error: ECONNREFUSED 127.0.0.1:11434 at /tmp/xyz789/index.js:99:7",
    );
    expect(a).toBe(b);
  });

  it("different root causes yield different signatures", () => {
    const a = buildFailureSignature("ECONNREFUSED");
    const b = buildFailureSignature("ENOENT no such file");
    expect(a).not.toBe(b);
  });

  it("decomposeTask produces only safe smaller tasks", () => {
    const task = createSmallModelTask({ userPrompt: "fix the build" });
    const result = decomposeTask(task, "max-retries");
    expect(result.subTasks.length).toBeGreaterThan(0);
    for (const sub of result.subTasks) {
      expect(sub.safe).toBe(true);
      // No "edit and verify" should be in the suggested set.
      expect(sub.suggestedAction).not.toBe("make_small_text_change_and_verify");
    }
  });

  it("explains what happened in plain English", () => {
    const task = createSmallModelTask({ userPrompt: "?" });
    const a = decomposeTask(task, "max-retries");
    const b = decomposeTask(task, "repeated-failure");
    expect(a.beginnerExplanation).toMatch(/smaller/);
    expect(b.beginnerExplanation).toMatch(/same error/);
  });

  it("blocked-risk produces an ask_user sub-task and nothing else risky", () => {
    const task = createSmallModelTask({
      userPrompt: "rm -rf",
      riskLevel: "blocked",
    });
    const result = decomposeTask(task, "blocked-risk");
    expect(result.subTasks.length).toBe(1);
    expect(result.subTasks[0].suggestedAction).toBe("ask_user");
  });
});
