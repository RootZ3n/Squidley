import { describe, expect, it } from "vitest";
import { evaluateLocalModelForTask, summarizeModelSuitability } from "./taskSuitability";

describe("local model task suitability", () => {
  it("treats deterministic/browser-local tasks as no-model-needed", () => {
    const decision = evaluateLocalModelForTask({ taskId: "velum.deterministic-review" });
    expect(decision.status).toBe("no-model-needed");
    expect(decision.beginnerMessage).toMatch(/No local model/i);
  });

  it("blocks embedding-only models for chat", () => {
    const decision = evaluateLocalModelForTask({
      taskId: "chat.basic",
      model: { name: "all-minilm:latest" },
    });
    expect(decision.status).toBe("blocked");
    expect(decision.beginnerMessage).toMatch(/embeddings/i);
  });

  it("allows tiny models only with verification warnings", () => {
    const chat = evaluateLocalModelForTask({
      taskId: "chat.basic",
      model: { name: "qwen3.5:0.8b" },
    });
    const planning = evaluateLocalModelForTask({
      taskId: "chat.advanced-planning",
      model: { name: "qwen3.5:0.8b" },
    });

    expect(chat.status).toBe("try-locally-verify");
    expect(planning.status).toBe("needs-stronger-local-model");
  });

  it("requires review for local planning even on larger models", () => {
    const decision = evaluateLocalModelForTask({
      taskId: "chat.advanced-planning",
      model: { name: "qwen2.5-14b-q4_k_m.gguf" },
      backend: "llama-cpp",
    });
    expect(decision.status).toBe("try-locally-verify");
    expect(decision.minimumLocalModel).toMatch(/14B/);
  });

  it("recognizes strong local code models for reviewed single-file suggestions", () => {
    const decision = evaluateLocalModelForTask({
      taskId: "fabrica.single-file-code",
      model: { name: "qwen3-coder:30b" },
    });
    expect(decision.status).toBe("can-do-locally");
    expect(decision.beginnerMessage).toMatch(/not an autonomous repo editor/i);
  });

  it("never permits local multi-file builds or tool agents", () => {
    expect(evaluateLocalModelForTask({ taskId: "workshop.multi-file-build", model: { name: "qwen3-coder:30b" } }).status).toBe("needs-cloud-unlock");
    expect(evaluateLocalModelForTask({ taskId: "agent.tool-use", model: { name: "qwen3-coder:30b" } }).status).toBe("needs-cloud-unlock");
  });

  it("blocks llama.cpp vision until real support is validated", () => {
    const decision = evaluateLocalModelForTask({
      taskId: "oculus.image-analysis",
      model: { name: "llava-v1.6-7b-q4_k_m.gguf" },
      backend: "llama-cpp",
    });
    expect(decision.status).toBe("blocked");
    expect(decision.beginnerMessage).toMatch(/llama\.cpp vision/i);
  });

  it("summarizes all task rows for a model", () => {
    const rows = summarizeModelSuitability({ model: { name: "llama-3.2-3b" } });
    expect(rows.map((row) => row.taskId)).toContain("chat.basic");
    expect(rows.map((row) => row.taskId)).toContain("workshop.multi-file-build");
    expect(rows.some((row) => row.status === "needs-cloud-unlock")).toBe(true);
  });
});
