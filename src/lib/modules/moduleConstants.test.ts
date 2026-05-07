import { describe, expect, it } from "vitest";
import {
  ARCHIVUM_BUNDLE_NAME,
  ARCHIVUM_ENTRY_SOURCES,
  ARCHIVUM_EXPORT_HEADER,
  ARCHIVUM_STORAGE_KEY,
  MORE_INPUT_HANDOFF_KINDS,
} from "@/lib/archivum/constants";
import {
  COLLOQUIUM_HANDOFF_KINDS,
  COLLOQUIUM_SESSIONS_STORAGE_KEY,
  COLLOQUIUM_STORAGE_KEY,
} from "@/lib/colloquium/constants";
import { FABRICA_ARCHIVUM_SOURCE, FABRICA_RECEIPT_ACTIONS } from "@/lib/fabrica/constants";
import { NOUS_MODEL_PREFERENCES_KEY } from "@/lib/nous/constants";
import {
  OCULUS_TO_COLLOQUIUM_HANDOFF_KEY,
  OCULUS_TO_COLLOQUIUM_HANDOFF_KIND,
} from "@/lib/oculus/constants";
import {
  TABULARIUM_EXPORT_HEADER,
  TABULARIUM_STORAGE_KEY,
} from "@/lib/tabularium/constants";
import {
  COLLOQUIUM_TO_VELUM_HANDOFF_KEY,
  MORE_INPUT_TO_VELUM_HANDOFF_KEY,
  VELUM_HANDOFF_KEY,
  VELUM_HANDOFF_KINDS,
  VELUM_TO_MORE_INPUT_HANDOFF_KEY,
} from "@/lib/velum/constants";
import { getModuleById } from "./registry";

describe("module boundary constants", () => {
  it("preserves persisted storage key values", () => {
    expect(COLLOQUIUM_STORAGE_KEY).toBe("squidley.colloquium.conversation.v1");
    expect(COLLOQUIUM_SESSIONS_STORAGE_KEY).toBe("squidley.colloquium.sessions.v2");
    expect(ARCHIVUM_STORAGE_KEY).toBe("squidley.archivum.entries.v1");
    expect(TABULARIUM_STORAGE_KEY).toBe("squidley.tabularium.receipts.v1");
    expect(NOUS_MODEL_PREFERENCES_KEY).toBe("squidley.nous.modelPreferences.v1");
  });

  it("preserves session handoff key values", () => {
    expect(VELUM_HANDOFF_KEY).toBe("squidley.velum.redactedDraft.v1");
    expect(COLLOQUIUM_TO_VELUM_HANDOFF_KEY).toBe("squidley.colloquium.velumDraft.v1");
    expect(MORE_INPUT_TO_VELUM_HANDOFF_KEY).toBe("squidley.moreInput.velumDraft.v1");
    expect(VELUM_TO_MORE_INPUT_HANDOFF_KEY).toBe("squidley.velum.moreInputRedacted.v1");
    expect(OCULUS_TO_COLLOQUIUM_HANDOFF_KEY).toBe("squidley.oculus.colloquiumAnalysis.v1");
  });

  it("preserves export headers and source ids", () => {
    expect(ARCHIVUM_EXPORT_HEADER).toBe("Squidley Public Archivum Export");
    expect(ARCHIVUM_BUNDLE_NAME).toBe("Squidley Public Archivum Bundle");
    expect(TABULARIUM_EXPORT_HEADER).toBe("Squidley Public Tabularium Export");
    expect(ARCHIVUM_ENTRY_SOURCES.manualPaste).toBe("manual-paste");
    expect(ARCHIVUM_ENTRY_SOURCES.oculusAnalysis).toBe("oculus-analysis");
    expect(FABRICA_ARCHIVUM_SOURCE).toBe("fabrica-suggestion");
  });

  it("keeps registry declarations aligned with module constants", () => {
    expect(getModuleById("colloquium")?.storageKeys).toEqual([
      COLLOQUIUM_SESSIONS_STORAGE_KEY,
      COLLOQUIUM_STORAGE_KEY,
    ]);
    expect(getModuleById("colloquium")?.handoffKinds).toEqual(COLLOQUIUM_HANDOFF_KINDS);
    expect(getModuleById("velum")?.handoffKinds).toEqual(VELUM_HANDOFF_KINDS);
    expect(getModuleById("more-input")?.handoffKinds).toEqual(MORE_INPUT_HANDOFF_KINDS);
    expect(getModuleById("oculus")?.handoffKinds).toEqual([OCULUS_TO_COLLOQUIUM_HANDOFF_KIND]);
    expect(getModuleById("fabrica")?.receiptActions).toEqual(FABRICA_RECEIPT_ACTIONS);
  });
});
