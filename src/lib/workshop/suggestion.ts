import type { ChatMessage } from "@/lib/chat/types";

export const FABRICA_LIMITS = {
  maxFileNameChars: 160,
  maxLanguageChars: 80,
  maxOriginalChars: 24_000,
  maxChangeChars: 4_000,
  maxModelChars: 200,
} as const;

export interface WorkshopRequest {
  fileName?: string;
  language: string;
  originalContent: string;
  requestedChange: string;
  model?: string;
}

export type WorkshopValidation =
  | { ok: true; value: WorkshopRequest }
  | { ok: false; error: string };

export function validateWorkshopRequest(input: unknown): WorkshopValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Workshop needs a JSON object." };
  }
  const data = input as Record<string, unknown>;
  const fileName = cleanOptional(data.fileName, FABRICA_LIMITS.maxFileNameChars);
  const language = cleanOptional(data.language, FABRICA_LIMITS.maxLanguageChars) || "text";
  const originalContent = typeof data.originalContent === "string" ? data.originalContent : "";
  const requestedChange = typeof data.requestedChange === "string" ? data.requestedChange.trim() : "";
  const model = cleanOptional(data.model, FABRICA_LIMITS.maxModelChars);

  if (originalContent.length > FABRICA_LIMITS.maxOriginalChars) {
    return { ok: false, error: "The pasted file is too long for this beginner Workshop pass." };
  }
  if (requestedChange.length === 0) {
    return { ok: false, error: "Describe the small single-file change you want Workshop to suggest." };
  }
  if (requestedChange.length > FABRICA_LIMITS.maxChangeChars) {
    return { ok: false, error: "The requested change is too long. Keep this to a small single-file task." };
  }

  return {
    ok: true,
    value: {
      ...(fileName ? { fileName } : {}),
      language,
      originalContent,
      requestedChange,
      ...(model ? { model } : {}),
    },
  };
}

export function buildWorkshopMessages(request: WorkshopRequest): ChatMessage[] {
  const name = request.fileName || "untitled single file";
  const original = request.originalContent.trim().length > 0
    ? request.originalContent
    : "(Start from scratch. No original file content was provided.)";
  return [
    {
      role: "system",
      content: [
        "You are Workshop in Peh.",
        "You help beginners with one file at a time.",
        "Do not claim you saved or edited files.",
        "Do not run commands, use tools, or describe autonomous actions.",
        "Do not propose repo-wide or multi-file changes.",
        "Do not ask for secrets.",
        "Return only the proposed complete single-file content.",
        "If a command would be needed, include it only as a comment inside the file when that is natural for the file type; otherwise omit it.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `File name: ${name}`,
        `Language or type: ${request.language}`,
        "",
        "Requested single-file change:",
        request.requestedChange,
        "",
        "Original file content:",
        "```",
        original,
        "```",
        "",
        "Return the proposed complete content for this one file only.",
      ].join("\n"),
    },
  ];
}

export function createWorkshopReceiptSummary(args: {
  fileName?: string;
  language: string;
  outputChars?: number;
}): string {
  const name = args.fileName?.trim() || "an unnamed single file";
  const output = typeof args.outputChars === "number" ? ` Suggested output length: ${args.outputChars} characters.` : "";
  return `Workshop created a local single-file suggestion for ${name} (${args.language}). No files were written and no commands were run.${output}`;
}

function cleanOptional(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxChars);
}
