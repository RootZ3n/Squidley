import { describe, expect, it } from "vitest";
import {
  ARCHIVUM_BUNDLE_NAME,
  ARCHIVUM_ENTRY_SOURCES,
  ARCHIVUM_EXPORT_HEADER,
  NOTEBOOK_STORAGE_KEY,
  MORE_INPUT_HANDOFF_KINDS,
} from "@/lib/notebook/constants";
import {
  CHAT_HANDOFF_KINDS,
  CHAT_SESSIONS_STORAGE_KEY,
  CHAT_STORAGE_KEY,
} from "@/lib/chat/moduleConstants";
import { WORKSHOP_NOTEBOOK_SOURCE, WORKSHOP_RECEIPT_ACTIONS } from "@/lib/workshop/constants";
import { INSIGHTS_MODEL_PREFERENCES_KEY } from "@/lib/insights/constants";
import {
  VISION_TO_CHAT_HANDOFF_KEY,
  VISION_TO_CHAT_HANDOFF_KIND,
} from "@/lib/vision/constants";
import {
  ACTIVITY_LOG_EXPORT_HEADER,
  ACTIVITY_LOG_STORAGE_KEY,
} from "@/lib/activity-log/constants";
import {
  CHAT_TO_VELUM_HANDOFF_KEY,
  MORE_INPUT_TO_VELUM_HANDOFF_KEY,
  VELUM_HANDOFF_KEY,
  VELUM_HANDOFF_KINDS,
  VELUM_TO_MORE_INPUT_HANDOFF_KEY,
} from "@/lib/velum/constants";
import { getModuleById } from "./registry";

describe("module boundary constants", () => {
  it("preserves persisted storage key values", () => {
    expect(CHAT_STORAGE_KEY).toBe("peh.chat.conversation.v1");
    expect(CHAT_SESSIONS_STORAGE_KEY).toBe("peh.chat.sessions.v2");
    expect(NOTEBOOK_STORAGE_KEY).toBe("peh.notebook.entries.v1");
    expect(ACTIVITY_LOG_STORAGE_KEY).toBe("peh.activity-log.receipts.v1");
    expect(INSIGHTS_MODEL_PREFERENCES_KEY).toBe("peh.nous.modelPreferences.v1");
  });

  it("preserves session handoff key values", () => {
    expect(VELUM_HANDOFF_KEY).toBe("peh.velum.redactedDraft.v1");
    expect(CHAT_TO_VELUM_HANDOFF_KEY).toBe("peh.chat.velumDraft.v1");
    expect(MORE_INPUT_TO_VELUM_HANDOFF_KEY).toBe("peh.moreInput.velumDraft.v1");
    expect(VELUM_TO_MORE_INPUT_HANDOFF_KEY).toBe("peh.velum.moreInputRedacted.v1");
    expect(VISION_TO_CHAT_HANDOFF_KEY).toBe("peh.vision.chatAnalysis.v1");
  });

  it("preserves export headers and source ids", () => {
    expect(ARCHIVUM_EXPORT_HEADER).toBe("Peh Public Notebook Export");
    expect(ARCHIVUM_BUNDLE_NAME).toBe("Peh Public Notebook Bundle");
    expect(ACTIVITY_LOG_EXPORT_HEADER).toBe("Peh Public Activity Log Export");
    expect(ARCHIVUM_ENTRY_SOURCES.manualPaste).toBe("manual-paste");
    expect(ARCHIVUM_ENTRY_SOURCES.oculusAnalysis).toBe("oculus-analysis");
    expect(WORKSHOP_NOTEBOOK_SOURCE).toBe("fabrica-suggestion");
  });

  it("keeps registry declarations aligned with module constants", () => {
    expect(getModuleById("chat")?.storageKeys).toEqual([
      CHAT_SESSIONS_STORAGE_KEY,
      CHAT_STORAGE_KEY,
    ]);
    expect(getModuleById("chat")?.handoffKinds).toEqual(CHAT_HANDOFF_KINDS);
    expect(getModuleById("velum")?.handoffKinds).toEqual(VELUM_HANDOFF_KINDS);
    expect(getModuleById("more-input")?.handoffKinds).toEqual(MORE_INPUT_HANDOFF_KINDS);
    expect(getModuleById("vision")?.handoffKinds).toEqual([VISION_TO_CHAT_HANDOFF_KIND]);
    expect(getModuleById("workshop")?.receiptActions).toEqual(WORKSHOP_RECEIPT_ACTIONS);
  });
});
