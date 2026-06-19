import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  PUBLIC_MODULES,
  getModuleById,
  getCoreLocalModules,
  getCloudUnlockModules,
} from "./registry";
import { validateModuleContracts } from "./validateModuleContracts";

const REQUIRED_CORE_LOCAL = [
  "colloquium",
  "fabrica",
  "archivum",
  "more-input",
  "velum",
  "archelon",
  "oculus",
  "activity-log",
  "nous",
];

const REQUIRED_CLOUD_UNLOCK = [
  "legatus",
  "probatio",
  "imperium",
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
    expect(m?.displayName).toBe("Chat");
    expect(m?.latinMeaning).toMatch(/conversation/i);
  });

  it("returns undefined for unknown ids", () => {
    expect(getModuleById("does-not-exist")).toBeUndefined();
  });

  it("Chat has tourAvailable enabled", () => {
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

  it("core-local modules with routes point to existing app routes", () => {
    for (const m of getCoreLocalModules()) {
      if (!m.route) continue;
      const routePath = m.route === "/" ? "page.tsx" : `${m.route.slice(1)}/page.tsx`;
      expect(existsSync(join(process.cwd(), "src/app", routePath)), `${m.id} route should exist`).toBe(true);
    }
  });

  it("cloud-unlock modules stay locked and do not expose active routes", () => {
    for (const m of getCloudUnlockModules()) {
      expect(m.route, `${m.id} should not expose a public route yet`).toBeUndefined();
      expect(m.cloudUnlockRequired).toBe(true);
      expect(m.localOnlySupported).toBe(false);
      expect(m.status, `${m.id} should remain locked`).toBe("locked");
      expect(m.enabled, `${m.id} should not be enabled`).toBe(false);
    }
  });

  it("satisfies the public module contract boundary", () => {
    const issues = validateModuleContracts(PUBLIC_MODULES, {
      routeExists(route) {
        const routePath = route === "/" ? "page.tsx" : `${route.slice(1)}/page.tsx`;
        return existsSync(join(process.cwd(), "src/app", routePath));
      },
    });
    expect(issues).toEqual([]);
  });

  it("declares docs, Assessment actions, receipts, storage, and handoff ownership", () => {
    for (const m of PUBLIC_MODULES) {
      expect(m.docs.primary || m.docs.note, `${m.id} should declare docs`).toBeTruthy();
      if (m.docs.primary) {
        expect(existsSync(join(process.cwd(), m.docs.primary)), `${m.id} doc should exist`).toBe(true);
      }
      expect(m.assessmentActions, `${m.id} should declare Assessment actions or none`).toBeDefined();
      expect(m.receiptActions, `${m.id} should declare receipt actions or none`).toBeDefined();
    }

    for (const id of ["colloquium", "archivum", "more-input", "activity-log", "nous"]) {
      expect(getModuleById(id)?.storageKeys?.length, `${id} should declare storage keys`).toBeGreaterThan(0);
    }
    for (const id of ["chat", "velum", "notebook", "more-input", "vision"]) {
      expect(getModuleById(id)?.handoffKinds?.length, `${id} should declare handoff kinds`).toBeGreaterThan(0);
    }
  });

  it("has no duplicate module ids or unaliased duplicate routes", () => {
    const ids = PUBLIC_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const routeOwners = new Map<string, string>();
    for (const m of PUBLIC_MODULES) {
      if (!m.route) continue;
      const existing = routeOwners.get(m.route);
      if (existing && !m.routeAliasOf) {
        throw new Error(`${m.id} duplicates ${m.route} without routeAliasOf`);
      }
      routeOwners.set(m.route, m.id);
    }
  });

  it("release hardening docs exist", () => {
    for (const path of [
      "docs/PUBLIC_RELEASE_CHECKLIST.md",
      "docs/LOCAL_MODEL_SETUP.md",
      "docs/KNOWN_LIMITATIONS.md",
      ".env.example",
    ]) {
      expect(existsSync(join(process.cwd(), path)), `${path} should exist`).toBe(true);
    }
  });

  it("describes public route behavior without overpromising unsupported modules", () => {
    expect(getModuleById("nous")?.beginnerDescription.toLowerCase()).toContain("cloud providers locked");
    expect(getModuleById("oculus")?.beginnerDescription.toLowerCase()).toContain("not stored");
    expect(getModuleById("activity-log")?.beginnerDescription.toLowerCase()).toContain("browser-local");
    expect(getModuleById("velum")?.beginnerDescription.toLowerCase()).toContain("deterministic");
    expect(getModuleById("archelon")?.beginnerDescription.toLowerCase()).toContain("not wired");
  });
});

describe("Workshop public-mode constraints", () => {
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
      "single-file",
    );
    expect(fabrica?.limitations?.join(" ").toLowerCase()).toContain("not a full coding agent");
  });
});
