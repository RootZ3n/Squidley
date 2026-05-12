/**
 * Lightweight input validation for /api/chat.
 *
 * The point is to give the upstream a sensible body and the user a friendly
 * error — not to model every edge case. Anything that's not obviously a chat
 * request shape gets rejected with a plain-language reason.
 */

import type { ChatMessage, ChatRequestBody, ChatRole } from "./types";

export const LIMITS = {
  maxMessageChars: 8000,
  maxHistoryMessages: 50,
  maxHistoryItemChars: 12000,
  maxModelChars: 200,
} as const;

const VALID_HISTORY_ROLES: readonly ChatRole[] = ["user", "assistant"];

export type ValidationResult =
  | { ok: true; value: ChatRequestBody }
  | { ok: false; error: string };

export function validateChatRequest(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const obj = input as Record<string, unknown>;

  // message
  const message = obj.message;
  if (typeof message !== "string") {
    return { ok: false, error: 'Field "message" is required and must be a string.' };
  }
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Message cannot be empty." };
  }
  if (message.length > LIMITS.maxMessageChars) {
    return {
      ok: false,
      error: `Message is too long (${message.length} chars; max ${LIMITS.maxMessageChars}).`,
    };
  }

  // model (optional)
  let model: string | undefined;
  if (obj.model !== undefined) {
    if (typeof obj.model !== "string") {
      return { ok: false, error: 'Field "model" must be a string when provided.' };
    }
    const m = obj.model.trim();
    if (m.length > LIMITS.maxModelChars) {
      return { ok: false, error: "Model name is too long." };
    }
    if (m.length > 0) model = m;
  }

  // history (optional)
  let history: ChatMessage[] | undefined;
  if (obj.history !== undefined) {
    if (!Array.isArray(obj.history)) {
      return { ok: false, error: 'Field "history" must be an array when provided.' };
    }
    if (obj.history.length > LIMITS.maxHistoryMessages) {
      return {
        ok: false,
        error: `History is too long (${obj.history.length} messages; max ${LIMITS.maxHistoryMessages}).`,
      };
    }
    const parsed: ChatMessage[] = [];
    for (let i = 0; i < obj.history.length; i++) {
      const item = obj.history[i];
      if (typeof item !== "object" || item === null) {
        return { ok: false, error: `History item ${i} must be an object.` };
      }
      const it = item as Record<string, unknown>;
      if (typeof it.role !== "string" || !VALID_HISTORY_ROLES.includes(it.role as ChatRole)) {
        return {
          ok: false,
          error: `History item ${i} has an unsupported role. Client-supplied system messages are not accepted.`,
        };
      }
      if (typeof it.content !== "string") {
        return { ok: false, error: `History item ${i} content must be a string.` };
      }
      if (it.content.length > LIMITS.maxHistoryItemChars) {
        return { ok: false, error: `History item ${i} is too long.` };
      }
      parsed.push({ role: it.role as ChatRole, content: it.content });
    }
    history = parsed;
  }

  return {
    ok: true,
    value: {
      message: trimmed,
      ...(model !== undefined ? { model } : {}),
      ...(history !== undefined ? { history } : {}),
    },
  };
}
