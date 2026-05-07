import type { ModuleTour } from "./types";

export const velumTour: ModuleTour = {
  moduleId: "velum",
  moduleName: "Velum",
  steps: [
    {
      id: "intro",
      target: "intro",
      title: "Welcome to Velum",
      body: '"Velum" means "veil" or "curtain." This page helps you pause before sharing text with AI by looking for possible secrets, private details, and prompt-like instructions.',
    },
    {
      id: "paste",
      target: "velum-paste",
      title: "Paste area",
      body: "Paste text here when you want a local review. Velum does not store or upload this text by default.",
    },
    {
      id: "review",
      target: "velum-review",
      title: "Review text",
      body: "This button runs simple local pattern checks. It does not call a cloud service or a model in this public pass.",
    },
    {
      id: "findings",
      target: "velum-findings",
      title: "Findings",
      body: "Findings explain possible risks in plain language. They are warnings to review, not a guarantee that the text is safe or unsafe.",
    },
    {
      id: "redaction",
      target: "velum-redaction",
      title: "Redacted preview",
      body: "Velum can create a local redacted preview. It does not overwrite your original text unless you choose to use it.",
    },
    {
      id: "local-only",
      target: "local-only-indicator",
      title: "Local-only guarantee",
      body: "Public Velum runs deterministic checks in your browser. No cloud fallback is used.",
    },
  ],
};
