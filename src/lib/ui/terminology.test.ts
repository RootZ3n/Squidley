/**
 * Terminology mapping contract.
 *
 * Pins the beginner-friendly UI vocabulary in
 * src/lib/ui/terminology.ts. The Sidebar, docs, and tests all read
 * from this module; this test ensures the mapping stays complete and
 * consistent with the canonical taxonomy in
 * docs/CAPABILITY_TAXONOMY.md.
 */

import { describe, expect, it } from "vitest";
import {
  CAPABILITY_TIER_DESCRIPTIONS,
  MODULE_TERMINOLOGY,
  TRUST_PHRASES,
  friendlyNameForLatin,
  navLabelWithSubtitle,
  type ModuleKey,
  type ModuleTerminology,
} from "./terminology";

const TERMS: Record<ModuleKey, ModuleTerminology> = MODULE_TERMINOLOGY;

const CANONICAL_TIERS = [
  "LOCAL_READY",
  "LOCAL_LIMITED",
  "LOCAL_PARTIAL",
  "CLOUD_PLANNED",
  "NOT_IMPLEMENTED",
  "BLOCKED",
] as const;

describe("module terminology", () => {
  it("covers every nav module used by the Sidebar", () => {
    const required: ModuleKey[] = [
      "colloquium",
      "fabrica",
      "archivum",
      "moreInput",
      "velum",
      "oculus",
      "tabularium",
      "nous",
      "modules",
      "settings",
      "archelon",
      "legatus",
      "probatio",
      "imperium",
      "imaginanium",
    ];
    for (const key of required) {
      expect(MODULE_TERMINOLOGY[key]).toBeDefined();
      expect(MODULE_TERMINOLOGY[key].friendlyLabel.length).toBeGreaterThan(0);
      expect(MODULE_TERMINOLOGY[key].beginnerDescription.length).toBeGreaterThan(0);
      expect(MODULE_TERMINOLOGY[key].tooltip.length).toBeGreaterThan(0);
    }
  });

  it("friendly labels avoid Latin module names", () => {
    const latinWords = [
      "colloquium",
      "fabrica",
      "archivum",
      "velum",
      "oculus",
      "tabularium",
      "nous",
      "archelon",
      "legatus",
      "probatio",
      "imperium",
      "imaginanium",
    ];
    for (const key of Object.keys(MODULE_TERMINOLOGY) as ModuleKey[]) {
      const term = MODULE_TERMINOLOGY[key];
      const lower = term.friendlyLabel.toLowerCase();
      for (const latin of latinWords) {
        // The friendly label must not BE the Latin name. (Substring is
        // OK for compound cases like "More Input".)
        if (lower === latin) {
          throw new Error(
            `Friendly label for ${key} is the Latin name "${term.friendlyLabel}"`,
          );
        }
      }
    }
  });

  it("locked modules carry a clear status suffix", () => {
    const locked: ModuleKey[] = [
      "legatus",
      "probatio",
      "imperium",
      "imaginanium",
    ];
    for (const key of locked) {
      const term = TERMS[key];
      expect(term.statusSuffix).toBe("(locked)");
    }
  });

  it("planned-but-future module is labelled planned, not locked", () => {
    expect(TERMS.archelon.statusSuffix).toBe("(planned)");
  });

  it("avoids jargon banned by UI_LANGUAGE_GUIDE.md in friendly labels and beginner descriptions", () => {
    const banned = [
      /\bagentic\b/i,
      /\borchestration\b/i,
      /\bexecution graph\b/i,
      /\bsubstrate\b/i,
      /\binvariant\b/i,
      // 'subsystem' and 'deterministic' may appear in advanced descriptions
      // but never in friendlyLabel or beginnerDescription.
    ];
    for (const key of Object.keys(MODULE_TERMINOLOGY) as ModuleKey[]) {
      const term = MODULE_TERMINOLOGY[key];
      for (const re of banned) {
        if (re.test(term.friendlyLabel) || re.test(term.beginnerDescription)) {
          throw new Error(
            `Banned UI jargon ${re} in module ${key}: "${term.friendlyLabel}" / "${term.beginnerDescription}"`,
          );
        }
      }
    }
  });

  it("friendlyNameForLatin resolves known Latin names case-insensitively", () => {
    expect(friendlyNameForLatin("Velum")).toBe("Safety Check");
    expect(friendlyNameForLatin("velum")).toBe("Safety Check");
    expect(friendlyNameForLatin("Tabularium")).toBe("Activity Log");
    expect(friendlyNameForLatin("Colloquium")).toBe("Chat");
    expect(friendlyNameForLatin("Legatus")).toBe("Agent Workflows");
  });

  it("does not expose lab-only modules (Praetorium) on the public surface", () => {
    expect((MODULE_TERMINOLOGY as Record<string, unknown>).praertorium).toBeUndefined();
    expect((MODULE_TERMINOLOGY as Record<string, unknown>).praetorium).toBeUndefined();
    expect(friendlyNameForLatin("Praertorium")).toBe("Praertorium");
    expect(friendlyNameForLatin("Praetorium")).toBe("Praetorium");
  });

  it("friendlyNameForLatin returns input verbatim on unknown names", () => {
    expect(friendlyNameForLatin("NotAModule")).toBe("NotAModule");
    expect(friendlyNameForLatin("")).toBe("");
  });

  it("navLabelWithSubtitle pairs friendly + Latin", () => {
    expect(navLabelWithSubtitle("velum")).toBe("Safety Check (Velum)");
    expect(navLabelWithSubtitle("modules")).toBe("Modules");
    expect(navLabelWithSubtitle("settings")).toBe("Settings");
  });
});

describe("capability tier descriptions", () => {
  it("covers every canonical tier", () => {
    const keys = Object.keys(CAPABILITY_TIER_DESCRIPTIONS).sort();
    expect(keys).toEqual([...CANONICAL_TIERS].sort());
  });

  it("every tier has label / short / long copy", () => {
    for (const tier of CANONICAL_TIERS) {
      const desc = CAPABILITY_TIER_DESCRIPTIONS[tier];
      expect(desc.label.length).toBeGreaterThan(0);
      expect(desc.short.length).toBeGreaterThan(0);
      expect(desc.long.length).toBeGreaterThan(0);
    }
  });

  it("BLOCKED tier copy uses 'intentionally unavailable' framing", () => {
    expect(CAPABILITY_TIER_DESCRIPTIONS.BLOCKED.label.toLowerCase()).toContain(
      "intentionally",
    );
  });

  it("LOCAL_LIMITED tier copy mentions approval", () => {
    expect(CAPABILITY_TIER_DESCRIPTIONS.LOCAL_LIMITED.short.toLowerCase()).toContain(
      "approval",
    );
  });

  it("CLOUD_PLANNED tier copy says not running yet", () => {
    const short = CAPABILITY_TIER_DESCRIPTIONS.CLOUD_PLANNED.short.toLowerCase();
    expect(short).toMatch(/not running yet|not implemented|planned/);
  });
});

describe("trust phrases", () => {
  it("uses 'this public Peh build' as the build identifier", () => {
    expect(TRUST_PHRASES.buildIdentifier).toBe("this public Peh build");
  });

  it("cloud-not-implemented phrase is canonical", () => {
    expect(TRUST_PHRASES.cloudNotImplemented).toBe(
      "Cloud Mode is not implemented yet.",
    );
  });

  it("provenance footer matches the structure greppable by the diagnostic", () => {
    expect(TRUST_PHRASES.provenanceFooterShort).toContain(
      "answered by local model only",
    );
    expect(TRUST_PHRASES.provenanceFooterShort).toContain("no tool used");
    expect(TRUST_PHRASES.provenanceFooterShort).toContain("no cloud used");
  });

  it("approval / decline phrases match the canonical UI buttons", () => {
    expect(TRUST_PHRASES.approveInspect).toBe("Approve and read once");
    expect(TRUST_PHRASES.approveEdit).toBe("Approve this edit");
    expect(TRUST_PHRASES.decline).toBe("Decline");
  });

  it("post-action phrases are calm and specific", () => {
    expect(TRUST_PHRASES.approvedInspect.toLowerCase()).toContain("approved");
    expect(TRUST_PHRASES.approvedInspect.toLowerCase()).toContain("once");
    expect(TRUST_PHRASES.approvedEdit.toLowerCase()).toContain("approved");
    expect(TRUST_PHRASES.approvedEdit.toLowerCase()).toContain("verifying");
    expect(TRUST_PHRASES.declinedInspect.toLowerCase()).toContain("declined");
    expect(TRUST_PHRASES.declinedInspect.toLowerCase()).toContain("not read");
    expect(TRUST_PHRASES.declinedEdit.toLowerCase()).toContain("declined");
    expect(TRUST_PHRASES.declinedEdit.toLowerCase()).toContain("no edit");
  });

  it("rollback phrases describe what actually happened", () => {
    const rollback = TRUST_PHRASES.rollbackOnVerifyFail.toLowerCase();
    expect(rollback).toContain("verification failed");
    expect(rollback).toContain("restored");
  });

  it("does not contain alarming words", () => {
    const banned = [
      /catastrophic/i,
      /\bfatal\b/i,
      /\bunknown error\b/i,
      /\bagent failed\b/i,
    ];
    const allPhrases = Object.values(TRUST_PHRASES).join(" ");
    for (const re of banned) {
      expect(allPhrases).not.toMatch(re);
    }
  });
});
