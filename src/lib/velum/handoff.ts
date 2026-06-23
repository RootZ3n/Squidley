export {
  CHAT_TO_VELUM_HANDOFF_KEY,
  MORE_INPUT_TO_VELUM_HANDOFF_KEY,
  VELUM_HANDOFF_KEY,
  VELUM_TO_MORE_INPUT_HANDOFF_KEY,
} from "@/lib/velum/constants";
import {
  CHAT_TO_VELUM_HANDOFF_KEY,
  MORE_INPUT_TO_VELUM_HANDOFF_KEY,
  VELUM_HANDOFF_KEY,
  VELUM_TO_MORE_INPUT_HANDOFF_KEY,
} from "@/lib/velum/constants";
export const VELUM_HANDOFF_VERSION = 1;
export const VELUM_HANDOFF_MAX_CHARS = 20000;
export const VELUM_HANDOFF_TTL_MS = 10 * 60 * 1000;

export interface VelumHandoffPayload {
  version: typeof VELUM_HANDOFF_VERSION;
  createdAt: number;
  source: "velum";
  localOnly: true;
  cloudUsed: false;
  originalIncluded: false;
  redactedText: string;
}

export interface ChatToVelumHandoffPayload {
  version: typeof VELUM_HANDOFF_VERSION;
  createdAt: number;
  source: "chat";
  localOnly: true;
  cloudUsed: false;
  modelUsed: false;
  draftText: string;
}

export interface MoreInputToVelumHandoffPayload {
  version: typeof VELUM_HANDOFF_VERSION;
  createdAt: number;
  source: "more-input";
  localOnly: true;
  cloudUsed: false;
  modelUsed: false;
  draftText: string;
  title?: string;
  entryType?: string;
  entryId?: string;
}

export interface VelumToMoreInputHandoffPayload {
  version: typeof VELUM_HANDOFF_VERSION;
  createdAt: number;
  source: "velum";
  target: "more-input";
  localOnly: true;
  cloudUsed: false;
  originalIncluded: false;
  redactedText: string;
  title?: string;
  entryType?: string;
  entryId?: string;
  riskSummary?: {
    overallRisk: "low" | "medium" | "high";
    findingCount: number;
    highestSeverity: "low" | "medium" | "high";
  };
}

export function createVelumHandoffPayload(
  redactedText: string,
  now = Date.now(),
): VelumHandoffPayload | null {
  const text = redactedText.trim();
  if (text.length === 0) return null;
  return {
    version: VELUM_HANDOFF_VERSION,
    createdAt: now,
    source: "velum",
    localOnly: true,
    cloudUsed: false,
    originalIncluded: false,
    redactedText: text.slice(0, VELUM_HANDOFF_MAX_CHARS),
  };
}

export function parseVelumHandoffPayload(raw: string | null, now = Date.now()): VelumHandoffPayload | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const payload = parsed as Partial<VelumHandoffPayload> | null;
  if (
    !payload ||
    payload.version !== VELUM_HANDOFF_VERSION ||
    payload.source !== "velum" ||
    payload.localOnly !== true ||
    payload.cloudUsed !== false ||
    payload.originalIncluded !== false ||
    typeof payload.createdAt !== "number" ||
    typeof payload.redactedText !== "string"
  ) {
    return null;
  }

  if (now - payload.createdAt > VELUM_HANDOFF_TTL_MS) return null;
  const text = payload.redactedText.trim();
  if (text.length === 0 || text.length > VELUM_HANDOFF_MAX_CHARS) return null;

  return {
    version: VELUM_HANDOFF_VERSION,
    createdAt: payload.createdAt,
    source: "velum",
    localOnly: true,
    cloudUsed: false,
    originalIncluded: false,
    redactedText: text,
  };
}

export function saveVelumHandoff(
  storage: Pick<Storage, "setItem">,
  redactedText: string,
  now = Date.now(),
): boolean {
  const payload = createVelumHandoffPayload(redactedText, now);
  if (!payload) return false;
  try {
    storage.setItem(VELUM_HANDOFF_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function consumeVelumHandoff(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now = Date.now(),
): VelumHandoffPayload | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(VELUM_HANDOFF_KEY);
  } catch {
    return null;
  } finally {
    try {
      storage.removeItem(VELUM_HANDOFF_KEY);
    } catch {
      // Ignore storage failures; handoff should never crash Chat.
    }
  }
  return parseVelumHandoffPayload(raw, now);
}

export function mergeVelumDraft(args: {
  existingDraft: string;
  importedDraft: string;
}): { draft: string; note: string } {
  const existing = args.existingDraft.trim();
  const imported = args.importedDraft.trim();
  if (existing.length === 0) {
    return {
      draft: imported,
      note: "Redacted Velum draft imported. Review it, then click Send when you are ready.",
    };
  }
  return {
    draft: `${args.existingDraft.trimEnd()}\n\n${imported}`,
    note: "Redacted Velum draft appended below your existing draft. Review it, then click Send when you are ready.",
  };
}

export function createChatToVelumPayload(
  draftText: string,
  now = Date.now(),
): ChatToVelumHandoffPayload | null {
  const text = draftText.trim();
  if (text.length === 0) return null;
  return {
    version: VELUM_HANDOFF_VERSION,
    createdAt: now,
    source: "chat",
    localOnly: true,
    cloudUsed: false,
    modelUsed: false,
    draftText: text.slice(0, VELUM_HANDOFF_MAX_CHARS),
  };
}

export function parseChatToVelumPayload(
  raw: string | null,
  now = Date.now(),
): ChatToVelumHandoffPayload | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const payload = parsed as Partial<ChatToVelumHandoffPayload> | null;
  if (
    !payload ||
    payload.version !== VELUM_HANDOFF_VERSION ||
    payload.source !== "chat" ||
    payload.localOnly !== true ||
    payload.cloudUsed !== false ||
    payload.modelUsed !== false ||
    typeof payload.createdAt !== "number" ||
    typeof payload.draftText !== "string"
  ) {
    return null;
  }

  if (now - payload.createdAt > VELUM_HANDOFF_TTL_MS) return null;
  const text = payload.draftText.trim();
  if (text.length === 0 || text.length > VELUM_HANDOFF_MAX_CHARS) return null;

  return {
    version: VELUM_HANDOFF_VERSION,
    createdAt: payload.createdAt,
    source: "chat",
    localOnly: true,
    cloudUsed: false,
    modelUsed: false,
    draftText: text,
  };
}

export function saveChatToVelumHandoff(
  storage: Pick<Storage, "setItem">,
  draftText: string,
  now = Date.now(),
): boolean {
  const payload = createChatToVelumPayload(draftText, now);
  if (!payload) return false;
  try {
    storage.setItem(CHAT_TO_VELUM_HANDOFF_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function consumeChatToVelumHandoff(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now = Date.now(),
): ChatToVelumHandoffPayload | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(CHAT_TO_VELUM_HANDOFF_KEY);
  } catch {
    return null;
  } finally {
    try {
      storage.removeItem(CHAT_TO_VELUM_HANDOFF_KEY);
    } catch {
      // Ignore storage failures; handoff should never crash Velum.
    }
  }
  return parseChatToVelumPayload(raw, now);
}

export function createMoreInputToVelumPayload(args: {
  draftText: string;
  title?: string;
  entryType?: string;
  entryId?: string;
  now?: number;
}): MoreInputToVelumHandoffPayload | null {
  const text = args.draftText.trim();
  if (text.length === 0) return null;
  return {
    version: VELUM_HANDOFF_VERSION,
    createdAt: args.now ?? Date.now(),
    source: "more-input",
    localOnly: true,
    cloudUsed: false,
    modelUsed: false,
    draftText: text.slice(0, VELUM_HANDOFF_MAX_CHARS),
    ...(args.title?.trim() ? { title: args.title.trim() } : {}),
    ...(args.entryType?.trim() ? { entryType: args.entryType.trim() } : {}),
    ...(args.entryId?.trim() ? { entryId: args.entryId.trim() } : {}),
  };
}

export function parseMoreInputToVelumPayload(
  raw: string | null,
  now = Date.now(),
): MoreInputToVelumHandoffPayload | null {
  const payload = parseDraftToVelumPayload(raw, "more-input", now);
  if (!payload) return null;
  return {
    ...payload,
    source: "more-input",
    ...(typeof payload.title === "string" ? { title: payload.title } : {}),
    ...(typeof payload.entryType === "string" ? { entryType: payload.entryType } : {}),
    ...(typeof payload.entryId === "string" ? { entryId: payload.entryId } : {}),
  };
}

export function saveMoreInputToVelumHandoff(
  storage: Pick<Storage, "setItem">,
  args: { draftText: string; title?: string; entryType?: string; entryId?: string; now?: number },
): boolean {
  const payload = createMoreInputToVelumPayload(args);
  if (!payload) return false;
  try {
    storage.setItem(MORE_INPUT_TO_VELUM_HANDOFF_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function consumeMoreInputToVelumHandoff(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now = Date.now(),
): MoreInputToVelumHandoffPayload | null {
  return consumeHandoff(storage, MORE_INPUT_TO_VELUM_HANDOFF_KEY, (raw) =>
    parseMoreInputToVelumPayload(raw, now),
  );
}

export function createVelumToMoreInputPayload(args: {
  redactedText: string;
  title?: string;
  entryType?: string;
  entryId?: string;
  riskSummary?: VelumToMoreInputHandoffPayload["riskSummary"];
  now?: number;
}): VelumToMoreInputHandoffPayload | null {
  const text = args.redactedText.trim();
  if (text.length === 0) return null;
  return {
    version: VELUM_HANDOFF_VERSION,
    createdAt: args.now ?? Date.now(),
    source: "velum",
    target: "more-input",
    localOnly: true,
    cloudUsed: false,
    originalIncluded: false,
    redactedText: text.slice(0, VELUM_HANDOFF_MAX_CHARS),
    ...(args.title?.trim() ? { title: args.title.trim() } : {}),
    ...(args.entryType?.trim() ? { entryType: args.entryType.trim() } : {}),
    ...(args.entryId?.trim() ? { entryId: args.entryId.trim() } : {}),
    ...(args.riskSummary ? { riskSummary: args.riskSummary } : {}),
  };
}

export function parseVelumToMoreInputPayload(
  raw: string | null,
  now = Date.now(),
): VelumToMoreInputHandoffPayload | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const payload = parsed as Partial<VelumToMoreInputHandoffPayload> | null;
  if (
    !payload ||
    payload.version !== VELUM_HANDOFF_VERSION ||
    payload.source !== "velum" ||
    payload.target !== "more-input" ||
    payload.localOnly !== true ||
    payload.cloudUsed !== false ||
    payload.originalIncluded !== false ||
    typeof payload.createdAt !== "number" ||
    typeof payload.redactedText !== "string"
  ) {
    return null;
  }
  if (now - payload.createdAt > VELUM_HANDOFF_TTL_MS) return null;
  const text = payload.redactedText.trim();
  if (text.length === 0 || text.length > VELUM_HANDOFF_MAX_CHARS) return null;
  return {
    version: VELUM_HANDOFF_VERSION,
    createdAt: payload.createdAt,
    source: "velum",
    target: "more-input",
    localOnly: true,
    cloudUsed: false,
    originalIncluded: false,
    redactedText: text,
    ...(typeof payload.title === "string" ? { title: payload.title } : {}),
    ...(typeof payload.entryType === "string" ? { entryType: payload.entryType } : {}),
    ...(typeof payload.entryId === "string" ? { entryId: payload.entryId } : {}),
    ...(isRiskSummary(payload.riskSummary) ? { riskSummary: payload.riskSummary } : {}),
  };
}

export function saveVelumToMoreInputHandoff(
  storage: Pick<Storage, "setItem">,
  args: Parameters<typeof createVelumToMoreInputPayload>[0],
): boolean {
  const payload = createVelumToMoreInputPayload(args);
  if (!payload) return false;
  try {
    storage.setItem(VELUM_TO_MORE_INPUT_HANDOFF_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function consumeVelumToMoreInputHandoff(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now = Date.now(),
): VelumToMoreInputHandoffPayload | null {
  return consumeHandoff(storage, VELUM_TO_MORE_INPUT_HANDOFF_KEY, (raw) =>
    parseVelumToMoreInputPayload(raw, now),
  );
}

function parseDraftToVelumPayload(
  raw: string | null,
  source: "more-input",
  now: number,
): MoreInputToVelumHandoffPayload | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const payload = parsed as Partial<MoreInputToVelumHandoffPayload> | null;
  if (
    !payload ||
    payload.version !== VELUM_HANDOFF_VERSION ||
    payload.source !== source ||
    payload.localOnly !== true ||
    payload.cloudUsed !== false ||
    payload.modelUsed !== false ||
    typeof payload.createdAt !== "number" ||
    typeof payload.draftText !== "string"
  ) {
    return null;
  }
  if (now - payload.createdAt > VELUM_HANDOFF_TTL_MS) return null;
  const text = payload.draftText.trim();
  if (text.length === 0 || text.length > VELUM_HANDOFF_MAX_CHARS) return null;
  return {
    version: VELUM_HANDOFF_VERSION,
    createdAt: payload.createdAt,
    source,
    localOnly: true,
    cloudUsed: false,
    modelUsed: false,
    draftText: text,
    ...(typeof payload.title === "string" ? { title: payload.title } : {}),
    ...(typeof payload.entryType === "string" ? { entryType: payload.entryType } : {}),
    ...(typeof payload.entryId === "string" ? { entryId: payload.entryId } : {}),
  };
}

function consumeHandoff<T>(
  storage: Pick<Storage, "getItem" | "removeItem">,
  key: string,
  parse: (raw: string | null) => T | null,
): T | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  } finally {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore storage failures; handoffs should never crash pages.
    }
  }
  return parse(raw);
}

function isRiskSummary(value: unknown): value is NonNullable<VelumToMoreInputHandoffPayload["riskSummary"]> {
  const summary = value as Partial<NonNullable<VelumToMoreInputHandoffPayload["riskSummary"]>> | null;
  return (
    !!summary &&
    (summary.overallRisk === "low" || summary.overallRisk === "medium" || summary.overallRisk === "high") &&
    (summary.highestSeverity === "low" || summary.highestSeverity === "medium" || summary.highestSeverity === "high") &&
    typeof summary.findingCount === "number" &&
    summary.findingCount >= 0
  );
}
