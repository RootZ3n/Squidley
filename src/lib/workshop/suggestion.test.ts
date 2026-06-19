import { describe, expect, it } from "vitest";
import {
  buildWorkshopMessages,
  createWorkshopReceiptSummary,
  validateWorkshopRequest,
} from "./suggestion";

describe("Workshop suggestion helpers", () => {
  it("validates a small single-file request", () => {
    const result = validateWorkshopRequest({
      fileName: "app.ts",
      language: "typescript",
      originalContent: "console.log('hi')",
      requestedChange: "Add a greeting constant.",
      model: "llama3.2",
    });
    expect(result).toMatchObject({ ok: true });
  });

  it("requires a requested change and rejects very large files", () => {
    expect(validateWorkshopRequest({ originalContent: "", requestedChange: "" })).toMatchObject({ ok: false });
    expect(validateWorkshopRequest({ originalContent: "x".repeat(24_001), requestedChange: "fix" })).toMatchObject({ ok: false });
  });

  it("builds strict prompt messages for single-file suggestions", () => {
    const messages = buildWorkshopMessages({
      fileName: "index.html",
      language: "html",
      originalContent: "<h1>Hello</h1>",
      requestedChange: "Make it friendlier.",
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain("one file at a time");
    expect(messages[0].content).toContain("Do not run commands");
    expect(messages[0].content).toContain("Return only the proposed complete single-file content");
    expect(messages[1].content).toContain("index.html");
  });

  it("receipt summaries avoid full source and output content", () => {
    const summary = createWorkshopReceiptSummary({
      fileName: "secret.ts",
      language: "typescript",
      outputChars: 1200,
    });
    expect(summary).toContain("No files were written");
    expect(summary).toContain("no commands were run");
    expect(summary).not.toContain("console.log");
  });
});
