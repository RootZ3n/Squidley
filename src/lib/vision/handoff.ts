export { VISION_TO_CHAT_HANDOFF_KEY } from "@/lib/vision/constants";
import { VISION_TO_CHAT_HANDOFF_KEY } from "@/lib/vision/constants";
export const OCULUS_HANDOFF_VERSION = 1;
export const OCULUS_HANDOFF_TTL_MS = 10 * 60 * 1000;
export const OCULUS_HANDOFF_MAX_CHARS = 12000;

export interface VisionToChatHandoffPayload {
  version: typeof OCULUS_HANDOFF_VERSION;
  createdAt: number;
  source: "oculus";
  target: "colloquium";
  localOnly: true;
  cloudUsed: false;
  imageIncluded: false;
  analysisText: string;
}

export function createVisionToChatPayload(
  analysisText: string,
  now = Date.now(),
): VisionToChatHandoffPayload | null {
  const text = analysisText.trim();
  if (text.length === 0) return null;
  return {
    version: OCULUS_HANDOFF_VERSION,
    createdAt: now,
    source: "oculus",
    target: "colloquium",
    localOnly: true,
    cloudUsed: false,
    imageIncluded: false,
    analysisText: text.slice(0, OCULUS_HANDOFF_MAX_CHARS),
  };
}

export function parseVisionToChatPayload(
  raw: string | null,
  now = Date.now(),
): VisionToChatHandoffPayload | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const payload = parsed as Partial<VisionToChatHandoffPayload> | null;
  if (
    !payload ||
    payload.version !== OCULUS_HANDOFF_VERSION ||
    payload.source !== "oculus" ||
    payload.target !== "colloquium" ||
    payload.localOnly !== true ||
    payload.cloudUsed !== false ||
    payload.imageIncluded !== false ||
    typeof payload.createdAt !== "number" ||
    typeof payload.analysisText !== "string"
  ) {
    return null;
  }
  if (now - payload.createdAt > OCULUS_HANDOFF_TTL_MS) return null;
  const text = payload.analysisText.trim();
  if (text.length === 0 || text.length > OCULUS_HANDOFF_MAX_CHARS) return null;
  return {
    version: OCULUS_HANDOFF_VERSION,
    createdAt: payload.createdAt,
    source: "oculus",
    target: "colloquium",
    localOnly: true,
    cloudUsed: false,
    imageIncluded: false,
    analysisText: text,
  };
}

export function saveVisionToChatHandoff(
  storage: Pick<Storage, "setItem">,
  analysisText: string,
  now = Date.now(),
): boolean {
  const payload = createVisionToChatPayload(analysisText, now);
  if (!payload) return false;
  try {
    storage.setItem(VISION_TO_CHAT_HANDOFF_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function consumeVisionToChatHandoff(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now = Date.now(),
): VisionToChatHandoffPayload | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(VISION_TO_CHAT_HANDOFF_KEY);
  } catch {
    return null;
  } finally {
    try {
      storage.removeItem(VISION_TO_CHAT_HANDOFF_KEY);
    } catch {
      // Ignore storage failures; handoffs should never crash Chat.
    }
  }
  return parseVisionToChatPayload(raw, now);
}
