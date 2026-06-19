import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PUBLIC_RELEASE_READY,
  LOCAL_MODE_SUBSYSTEM_READY,
  CLOUD_MODE_SUBSYSTEM_READY,
  TEACHING_LAYER_READY,
  TOOL_EXECUTION_READY,
  AUTONOMOUS_WORKFLOWS_READY,
  RELEASE_PHASES,
  getIncompletePhases,
  getProductStatusSummary,
} from "./productStatus";
import { CLOUD_PROVIDER_REGISTRY } from "../providers/cloudRegistry";
import { MODE_CAPABILITY_MATRIX } from "./capabilityMatrix";

const REPO_ROOT = path.resolve(__dirname, "../../..");

function readDoc(relPath: string): string {
  try {
    return readFileSync(path.join(REPO_ROOT, relPath), "utf8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Product status truth enforcement
// ---------------------------------------------------------------------------

describe("Product status truthfulness", () => {
  it("PUBLIC_RELEASE_READY is false", () => {
    expect(PUBLIC_RELEASE_READY).toBe(false);
  });

  it("local mode subsystem is ready", () => {
    expect(LOCAL_MODE_SUBSYSTEM_READY).toBe(true);
  });

  it("cloud mode subsystem is NOT ready", () => {
    expect(CLOUD_MODE_SUBSYSTEM_READY).toBe(false);
  });

  it("teaching layer is NOT ready", () => {
    expect(TEACHING_LAYER_READY).toBe(false);
  });

  it("tool execution is NOT ready", () => {
    expect(TOOL_EXECUTION_READY).toBe(false);
  });

  it("autonomous workflows are NOT ready", () => {
    expect(AUTONOMOUS_WORKFLOWS_READY).toBe(false);
  });

  it("there are incomplete phases blocking release", () => {
    const incomplete = getIncompletePhases();
    expect(incomplete.length).toBeGreaterThan(0);
  });

  it("product status summary reports publicReleaseReady=false", () => {
    const summary = getProductStatusSummary();
    expect(summary.publicReleaseReady).toBe(false);
    expect(summary.localModeReady).toBe(true);
    expect(summary.cloudModeReady).toBe(false);
    expect(summary.teachingLayerReady).toBe(false);
    expect(summary.blockers.length).toBeGreaterThan(0);
  });

  it("only Phase 1 is complete, Phase 2 is in-progress", () => {
    const complete = RELEASE_PHASES.filter((p) => p.status === "complete");
    expect(complete.length).toBe(1);
    expect(complete[0].id).toBe("phase-1");

    const inProgress = RELEASE_PHASES.filter((p) => p.status === "in-progress");
    expect(inProgress.length).toBe(1);
    expect(inProgress[0].id).toBe("phase-2");
  });
});

// ---------------------------------------------------------------------------
// README truthfulness
// ---------------------------------------------------------------------------

describe("README does not claim product release-readiness", () => {
  const readme = readDoc("README.md");

  it("README exists", () => {
    expect(readme.length).toBeGreaterThan(0);
  });

  it("README says NOT RELEASE READY", () => {
    expect(readme).toContain("NOT RELEASE READY");
  });

  it("README does not say 'release ready' or 'ready to ship' unqualified", () => {
    const lower = readme.toLowerCase();
    // Allow "NOT release ready" and "not ready to ship" but not unqualified positive claims
    const stripped = lower
      .replace(/not release ready/g, "")
      .replace(/not ready to ship/g, "")
      .replace(/not yet ready to ship/g, "")
      .replace(/is not ready to ship/g, "");
    expect(stripped).not.toContain("release ready");
  });

  it("README does not position local-only as the final product", () => {
    expect(readme).not.toContain("local-only by design");
    expect(readme).not.toContain("This is not an autonomous");
    // Should contain language about Cloud Mode being part of the product
    expect(readme.toLowerCase()).toContain("cloud mode");
  });

  it("README references the release plan", () => {
    expect(readme).toContain("PUBLIC_PEH_RELEASE_PLAN.md");
  });

  it("README references the teacher-first doctrine", () => {
    expect(readme).toContain("TEACHER_FIRST_DOCTRINE.md");
  });
});

// ---------------------------------------------------------------------------
// Cloud Mode docs do not imply functional adapters
// ---------------------------------------------------------------------------

describe("Cloud Mode docs do not imply functional adapters", () => {
  const cloudDoc = readDoc("docs/CLOUD_MODE.md");

  it("Cloud Mode doc exists", () => {
    expect(cloudDoc.length).toBeGreaterThan(0);
  });

  it("says architecture only", () => {
    expect(cloudDoc).toContain("ARCHITECTURE ONLY");
  });

  it("says not functional", () => {
    expect(cloudDoc.toUpperCase()).toContain("NOT FUNCTIONAL");
  });

  it("does not claim adapters are implemented", () => {
    // Every provider must be NOT_IMPLEMENTED
    expect(cloudDoc).not.toMatch(/\|\s*IMPLEMENTED\s*\|/);
  });

  it("says product does not ship until cloud mode works", () => {
    expect(cloudDoc.toLowerCase()).toContain("does not ship until cloud mode works");
  });
});

// ---------------------------------------------------------------------------
// Local Mode docs do not imply final product
// ---------------------------------------------------------------------------

describe("Local Mode docs do not imply final product", () => {
  const localDoc = readDoc("docs/LOCAL_MODE.md");

  it("Local Mode doc exists", () => {
    expect(localDoc.length).toBeGreaterThan(0);
  });

  it("says subsystem not product", () => {
    // The doc may wrap the phrase across lines, so collapse whitespace
    const collapsed = localDoc.toLowerCase().replace(/\s+/g, " ");
    expect(collapsed).toContain("not the final product");
  });

  it("references the release plan", () => {
    expect(localDoc).toContain("PUBLIC_PEH_RELEASE_PLAN.md");
  });

  it("mentions graduation to Cloud Mode", () => {
    const lower = localDoc.toLowerCase();
    expect(lower).toContain("graduat");
  });
});

// ---------------------------------------------------------------------------
// Cloud Mode capability matrix is honest
// ---------------------------------------------------------------------------

describe("Capability matrix does not overclaim Cloud Mode", () => {
  it("no cloud provider has IMPLEMENTED status", () => {
    const cloudProviders = CLOUD_PROVIDER_REGISTRY.filter(
      (p) => p.locality === "cloud",
    );
    for (const p of cloudProviders) {
      expect(p.status).toBe("NOT_IMPLEMENTED");
    }
  });

  it("cloud READY capabilities only exist for browser-local features", () => {
    const cloudReady = MODE_CAPABILITY_MATRIX.filter(
      (c) => c.cloudModeStatus === "READY",
    );
    for (const cap of cloudReady) {
      // Must have cloud proof references or be a browser-local feature
      const isBrowserLocal =
        cap.cloudLimitations.toLowerCase().includes("same as local") ||
        cap.cloudLimitations.toLowerCase().includes("browser") ||
        cap.localImplementation !== undefined;
      expect(isBrowserLocal).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Required docs exist
// ---------------------------------------------------------------------------

describe("Required product docs exist", () => {
  const requiredDocs = [
    "docs/PUBLIC_PEH_RELEASE_PLAN.md",
    "docs/TEACHER_FIRST_DOCTRINE.md",
    "docs/BEGINNER_ONBOARDING_DESIGN.md",
    "docs/SELF_EXPLANATION_REQUIREMENTS.md",
  ];

  for (const doc of requiredDocs) {
    it(`${doc} exists`, () => {
      expect(existsSync(path.join(REPO_ROOT, doc))).toBe(true);
    });
  }

  it("release plan contains all six phases", () => {
    const plan = readDoc("docs/PUBLIC_PEH_RELEASE_PLAN.md");
    expect(plan).toContain("Phase 1");
    expect(plan).toContain("Phase 2");
    expect(plan).toContain("Phase 3");
    expect(plan).toContain("Phase 4");
    expect(plan).toContain("Phase 5");
    expect(plan).toContain("Phase 6");
  });

  it("release plan says NOT RELEASE READY", () => {
    const plan = readDoc("docs/PUBLIC_PEH_RELEASE_PLAN.md");
    expect(plan).toContain("NOT RELEASE READY");
  });

  it("teacher-first doctrine has all ten rules", () => {
    const doctrine = readDoc("docs/TEACHER_FIRST_DOCTRINE.md");
    expect(doctrine).toContain("### 1.");
    expect(doctrine).toContain("### 10.");
  });

  it("self-explanation requirements list required questions", () => {
    const selfExplain = readDoc("docs/SELF_EXPLANATION_REQUIREMENTS.md");
    expect(selfExplain).toContain("What are you?");
    expect(selfExplain).toContain("What is Local Mode?");
    expect(selfExplain).toContain("What is Cloud Mode?");
    expect(selfExplain).toContain("What is a tool?");
    expect(selfExplain).toContain("What is a receipt?");
    expect(selfExplain).toContain("NOT IMPLEMENTED");
  });

  it("onboarding design has all six sections", () => {
    const onboarding = readDoc("docs/BEGINNER_ONBOARDING_DESIGN.md");
    expect(onboarding).toContain("### 1. Welcome");
    expect(onboarding).toContain("### 2. Local Mode First");
    expect(onboarding).toContain("### 3. Trust Basics");
    expect(onboarding).toContain("### 4. Cloud Graduation");
    expect(onboarding).toContain("### 5. Tool Graduation");
    expect(onboarding).toContain("### 6. First Autonomous Workflow");
    expect(onboarding).toContain("NOT IMPLEMENTED");
  });
});
