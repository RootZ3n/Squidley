import { describe, it, expect } from "vitest";
import { PUBLIC_MODULES, getModuleById } from "@/lib/modules/registry";
import {
  CAPABILITIES,
  findOrphanCapabilityModuleIds,
  findUnregisteredAssessmentActions,
  getCapabilitiesForModule,
} from "./registry";
import { CAPABILITY_TIERS } from "./contracts";

describe("public capability registry", () => {
  it("registers exactly one capability per assessmentActions entry across PUBLIC_MODULES", () => {
    const missing = findUnregisteredAssessmentActions();
    expect(missing, `missing capabilities: ${JSON.stringify(missing)}`).toEqual([]);

    let totalActions = 0;
    for (const m of PUBLIC_MODULES) {
      if (m.assessmentActions === "none") continue;
      totalActions += m.assessmentActions.length;
    }
    expect(CAPABILITIES.length).toBe(totalActions);
  });

  it("every capability moduleId resolves to a registered public module", () => {
    const orphans = findOrphanCapabilityModuleIds();
    expect(orphans, `orphan capability moduleIds: ${orphans.join(", ")}`).toEqual([]);
    for (const c of CAPABILITIES) {
      expect(getModuleById(c.moduleId), `${c.id} → unknown moduleId ${c.moduleId}`).toBeDefined();
    }
  });

  it("every capability tier is one of the legal CapabilityTier values", () => {
    const legal = new Set(CAPABILITY_TIERS);
    for (const c of CAPABILITIES) {
      expect(legal.has(c.tier), `${c.id} has illegal tier ${c.tier}`).toBe(true);
    }
  });

  it("every cloud-required capability is velum-gated", () => {
    for (const c of CAPABILITIES) {
      if (c.tier !== "cloud-required") continue;
      expect(c.velumGated, `${c.id} is cloud-required but velumGated is false`).toBe(true);
    }
  });

  it("every cloud-required capability has a cloudRequired honest message", () => {
    for (const c of CAPABILITIES) {
      if (c.tier !== "cloud-required") continue;
      const msg = c.honestMessages.cloudRequired;
      expect(msg, `${c.id} missing honestMessages.cloudRequired`).toBeTruthy();
      expect((msg ?? "").length, `${c.id} has empty cloudRequired message`).toBeGreaterThan(10);
    }
  });

  it("every local-core capability has at least one local path or an explicit local message", () => {
    for (const c of CAPABILITIES) {
      if (c.tier !== "local-core") continue;
      const hasLocalPath = c.localRequirements.length > 0;
      const hasLocalMessage = Boolean((c.honestMessages.localReady ?? "").trim());
      expect(
        hasLocalPath || hasLocalMessage,
        `${c.id} is local-core but has no local provider path and no localReady message`,
      ).toBe(true);
    }
  });

  it("has no duplicate capability ids", () => {
    const ids = CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size, `duplicate capability ids in: ${ids.join(", ")}`).toBe(ids.length);
  });

  it("capability ids follow the moduleId:actionId convention so they are auditable", () => {
    for (const c of CAPABILITIES) {
      expect(c.id.startsWith(`${c.moduleId}:`), `${c.id} does not start with its moduleId`).toBe(true);
    }
  });

  it("getCapabilitiesForModule returns capabilities for known modules and empty for unknown", () => {
    expect(getCapabilitiesForModule("colloquium").length).toBeGreaterThan(0);
    expect(getCapabilitiesForModule("does-not-exist")).toEqual([]);
  });

  it("blocked capabilities expose a blocked honest message", () => {
    for (const c of CAPABILITIES) {
      if (c.tier !== "blocked") continue;
      expect(c.honestMessages.blocked, `${c.id} blocked tier missing blocked message`).toBeTruthy();
    }
  });
});
