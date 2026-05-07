export { OCULUS_TO_COLLOQUIUM_HANDOFF_KEY } from "@/lib/oculus/constants";
import { OCULUS_TO_COLLOQUIUM_HANDOFF_KEY } from "@/lib/oculus/constants";
export const OCULUS_HANDOFF_VERSION = 1;
export const OCULUS_HANDOFF_TTL_MS = 10 * 60 * 1000;
export const OCULUS_HANDOFF_MAX_CHARS = 12000;

export interface OculusToColloquiumHandoffPayload {
  version: typeof OCULUS_HANDOFF_VERSION;
  createdAt: number;
  source: "oculus";
  target: "colloquium";
  localOnly: true;
  cloudUsed: false;
  imageIncluded: false;
  analysisText: string;
}

export function createOculusToColloquiumPayload(
  analysisText: string,
  now = Date.now(),
): OculusToColloquiumHandoffPayload | null {
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

export function parseOculusToColloquiumPayload(
  raw: string | null,
  now = Date.now(),
): OculusToColloquiumHandoffPayload | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const payload = parsed as Partial<OculusToColloquiumHandoffPayload> | null;
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

export function saveOculusToColloquiumHandoff(
  storage: Pick<Storage, "setItem">,
  analysisText: string,
  now = Date.now(),
): boolean {
  const payload = createOculusToColloquiumPayload(analysisText, now);
  if (!payload) return false;
  try {
    storage.setItem(OCULUS_TO_COLLOQUIUM_HANDOFF_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function consumeOculusToColloquiumHandoff(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now = Date.now(),
): OculusToColloquiumHandoffPayload | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(OCULUS_TO_COLLOQUIUM_HANDOFF_KEY);
  } catch {
    return null;
  } finally {
    try {
      storage.removeItem(OCULUS_TO_COLLOQUIUM_HANDOFF_KEY);
    } catch {
      // Ignore storage failures; handoffs should never crash Colloquium.
    }
  }
  return parseOculusToColloquiumPayload(raw, now);
}
