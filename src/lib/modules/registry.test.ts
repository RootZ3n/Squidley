import { describe, it, expect } from "vitest";
import {
  PUBLIC_MODULES,
  getModuleById,
  getCoreLocalModules,
  getCloudUnlockModules,
} from "./registry";

const REQUIRED_CORE_LOCAL = [
  "colloquium",
  "fabrica",
  "archivum",
  "more-input",
  "velum",
  "archelon",
  "oculus",
  "tabularium",
  "nous",
];

const REQUIRED_CLOUD_UNLOCK = [
  "legatus",
  "probatio",
  "imperium",
  "praertorium",
  "imaginanium",
];

describe("public module registry", () => {
  it("has unique module ids", () => {
    const ids = PUBLIC_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes every required core-local module", () => {
    const ids = getCoreLocalModules().map((m) => m.id);
    for (const id of REQUIRED_CORE_LOCAL) {
      expect(ids).toContain(id);
    }
  });

  it("includes every required cloud-unlock module", () => {
    const ids = getCloudUnlockModules().map((m) => m.id);
    for (const id of REQUIRED_CLOUD_UNLOCK) {
      expect(ids).toContain(id);
    }
  });

  it("core-local modules support local-only and do not require cloud unlock", () => {
    for (const m of getCoreLocalModules()) {
      expect(m.localOnlySupported, `${m.id} should be local-only supported`).toBe(true);
      expect(m.cloudUnlockRequired, `${m.id} should not require cloud unlock`).toBe(false);
    }
  });

  it("cloud-unlock modules require cloud unlock and are not local-only", () => {
    for (const m of getCloudUnlockModules()) {
      expect(m.cloudUnlockRequired, `${m.id} should require cloud unlock`).toBe(true);
      expect(m.localOnlySupported, `${m.id} should not be local-only supported`).toBe(false);
    }
  });

  it("getModuleById returns the matching module", () => {
    const m = getModuleById("colloquium");
    expect(m).toBeDefined();
    expect(m?.displayName).toBe("Colloquium");
    expect(m?.latinMeaning).toMatch(/conversation/i);
  });

  it("returns undefined for unknown ids", () => {
    expect(getModuleById("does-not-exist")).toBeUndefined();
  });

  it("Colloquium has tourAvailable enabled", () => {
    expect(getModuleById("colloquium")?.tourAvailable).toBe(true);
  });

  it("groups exactly into core-local and cloud-unlock with no leftovers", () => {
    const core = getCoreLocalModules();
    const cloud = getCloudUnlockModules();
    expect(core.length + cloud.length).toBe(PUBLIC_MODULES.length);
    for (const m of core) expect(m.category).toBe("core-local");
    for (const m of cloud) expect(m.category).toBe("cloud-unlock");
  });

  it("every public module has a non-empty beginner description", () => {
    for (const m of PUBLIC_MODULES) {
      expect(m.beginnerDescription.length, `${m.id} description empty`).toBeGreaterThan(20);
    }
  });
});

describe("Fabrica public-mode constraints", () => {
  const fabrica = getModuleById("fabrica");

  it("exists in the registry", () => {
    expect(fabrica).toBeDefined();
  });

  it("is core-local and not cloud-unlock", () => {
    expect(fabrica?.category).toBe("core-local");
    expect(fabrica?.cloudUnlockRequired).toBe(false);
    expect(fabrica?.localOnlySupported).toBe(true);
  });

  it("declares its single-file limitation in metadata", () => {
    expect(fabrica?.limitations).toBeDefined();
    expect(fabrica!.limitations!.length).toBeGreaterThan(0);
    const all = fabrica!.limitations!.join(" ").toLowerCase();
    expect(all).toContain("single-file");
    expect(all).toMatch(/not a full.*coding agent|not a full coding agent/);
  });

  it("description mentions it is not a full coding agent", () => {
    expect(fabrica?.beginnerDescription.toLowerCase()).toContain(
      "not a full coding agent",
    );
  });
});
