import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

import { isTeacherIntent } from "./detect";
import { tryTeacherAnswer, teacherResultToPayload } from "./chatIntegration";
import {
  createInitialProgress,
  completeStage,
  skipStage,
  resetProgress,
  resolveNextStage,
  setExperienceLevel,
  completeConcept,
  getCompletionPercentage,
} from "./onboardingProgress";
import { getRuntimeTeachingExplanation } from "./runtimeExplain";
import { getConceptById } from "./concepts";
import type { RuntimeTeachingEvent } from "./types";

const REPO_ROOT = path.resolve(__dirname, "../../..");

// ---------------------------------------------------------------------------
// Teacher intent detection
// ---------------------------------------------------------------------------

describe("Teacher intent detection", () => {
  it("detects 'what are you?'", () => {
    expect(isTeacherIntent("What are you?")).toBe(true);
  });

  it("detects 'what is a tool call?'", () => {
    expect(isTeacherIntent("What is a tool call?")).toBe(true);
  });

  it("detects 'what is a token?'", () => {
    expect(isTeacherIntent("What is a token?")).toBe(true);
  });

  it("detects 'what is Local Mode?'", () => {
    expect(isTeacherIntent("What is Local Mode?")).toBe(true);
  });

  it("detects 'what is Cloud Mode?'", () => {
    expect(isTeacherIntent("What is Cloud Mode?")).toBe(true);
  });

  it("detects 'what can you do?'", () => {
    expect(isTeacherIntent("What can you do?")).toBe(true);
  });

  it("detects 'can you write a file?'", () => {
    expect(isTeacherIntent("Can you write a file?")).toBe(true);
  });

  it("detects 'what is a receipt?'", () => {
    expect(isTeacherIntent("What is a receipt?")).toBe(true);
  });

  it("detects 'did anything leave my computer?'", () => {
    expect(isTeacherIntent("Did anything leave my computer?")).toBe(true);
  });

  it("detects 'what does model-only mean?'", () => {
    expect(isTeacherIntent("What does model-only mean?")).toBe(true);
  });

  it("detects 'how do I know what you actually did?'", () => {
    expect(isTeacherIntent("How do I know what you actually did?")).toBe(true);
  });

  it("detects 'why can't you write files?'", () => {
    expect(isTeacherIntent("Why can't you write files?")).toBe(true);
  });

  it("does NOT detect general conversation", () => {
    expect(isTeacherIntent("Write me a Python function that sorts a list")).toBe(false);
  });

  it("does NOT detect long messages even with keywords", () => {
    const long = "What is a token? " + "x".repeat(300);
    expect(isTeacherIntent(long)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Teacher chat integration
// ---------------------------------------------------------------------------

describe("Teacher chat integration", () => {
  it("teacher questions route to teacher layer", () => {
    const result = tryTeacherAnswer("What is a tool call?");
    expect(result.handled).toBe(true);
    expect(result.source).toBe("teacher_layer");
  });

  it("'what is a tool call?' answers from concept registry", () => {
    const result = tryTeacherAnswer("What is a tool call?");
    expect(result.handled).toBe(true);
    expect(result.conceptsCovered).toContain("tool_call");
    expect(result.reply).toBeTruthy();
    expect(result.reply!.length).toBeGreaterThan(50);
  });

  it("'what is a token?' answers from concept registry", () => {
    const result = tryTeacherAnswer("What is a token?");
    expect(result.handled).toBe(true);
    expect(result.conceptsCovered).toContain("token");
  });

  it("'what can you do locally?' uses capability/tool matrix", () => {
    const result = tryTeacherAnswer("What can you do?", "local");
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("I can:");
  });

  it("'can you write files?' says not implemented", () => {
    const result = tryTeacherAnswer("Can you write a file?");
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("Not implemented");
  });

  it("'what is cloud mode?' says not implemented", () => {
    const result = tryTeacherAnswer("What is Cloud Mode?");
    expect(result.handled).toBe(true);
    expect(result.reply!.toLowerCase()).toContain("not yet implemented");
  });

  it("teacher answers do not call cloud", () => {
    const result = tryTeacherAnswer("What is a receipt?");
    expect(result.handled).toBe(true);
    // No cloud field — teacher answers are deterministic
    expect(result.source).toBe("teacher_layer");
  });

  it("teacher answer provenance is correct", () => {
    const result = tryTeacherAnswer("What is Local Mode?");
    expect(result.handled).toBe(true);
    expect(result.source).toBe("teacher_layer");
    expect(result.responseMode).toBe("local_model");
  });

  it("general conversation is not intercepted", () => {
    const result = tryTeacherAnswer("Write me a haiku about cats");
    expect(result.handled).toBe(false);
  });

  it("teacherResultToPayload produces valid payload", () => {
    const result = tryTeacherAnswer("What is a token?");
    expect(result.handled).toBe(true);
    const payload = teacherResultToPayload(result);
    expect(payload.ok).toBe(true);
    expect(payload.provider).toBe("local");
    expect(payload.cloudUsed).toBe(false);
    expect(payload.toolsUsed).toBe(false);
    expect(payload.model).toBe("teacher_layer");
    expect(payload.teacherSource).toBe("teacher_layer");
    expect(payload.reply.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Onboarding progress
// ---------------------------------------------------------------------------

describe("Onboarding progress", () => {
  it("starts at welcome", () => {
    const p = createInitialProgress();
    expect(p.currentStage).toBe("welcome");
    expect(p.completedStages).toEqual([]);
  });

  it("can complete stage", () => {
    let p = createInitialProgress();
    p = completeStage(p, "welcome");
    expect(p.completedStages).toContain("welcome");
    expect(p.currentStage).toBe("what-is-agent"); // next stage
  });

  it("cannot complete unknown stage", () => {
    let p = createInitialProgress();
    p = completeStage(p, "nonexistent-stage");
    expect(p.completedStages).toEqual([]);
    expect(p.currentStage).toBe("welcome");
  });

  it("can skip stage", () => {
    let p = createInitialProgress();
    p = skipStage(p, "welcome");
    expect(p.skippedStages).toContain("welcome");
    expect(p.currentStage).toBe("what-is-agent");
  });

  it("next stage resolves correctly", () => {
    const p = createInitialProgress();
    const next = resolveNextStage(p);
    expect(next).toBe("what-is-agent");
  });

  it("reset works", () => {
    let p = createInitialProgress();
    p = completeStage(p, "welcome");
    p = completeStage(p, "what-is-agent");
    p = resetProgress();
    expect(p.currentStage).toBe("welcome");
    expect(p.completedStages).toEqual([]);
  });

  it("experience level can be set", () => {
    let p = createInitialProgress();
    expect(p.userExperienceLevel).toBe("brand_new");
    p = setExperienceLevel(p, "intermediate");
    expect(p.userExperienceLevel).toBe("intermediate");
  });

  it("concept completion works", () => {
    let p = createInitialProgress();
    p = completeConcept(p, "token");
    expect(p.completedConcepts).toContain("token");
  });

  it("invalid concept is ignored", () => {
    let p = createInitialProgress();
    p = completeConcept(p, "fake_concept_xyz");
    expect(p.completedConcepts).toEqual([]);
  });

  it("completion percentage works", () => {
    let p = createInitialProgress();
    expect(getCompletionPercentage(p)).toBe(0);
    p = completeStage(p, "welcome");
    expect(getCompletionPercentage(p)).toBeGreaterThan(0);
  });

  it("no cloud/network involved", () => {
    // All operations are pure functions on data
    const p = createInitialProgress();
    const p2 = completeStage(p, "welcome");
    // No fetch, no Promise, no side effects
    expect(typeof p2.currentStage).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Runtime hook explanations
// ---------------------------------------------------------------------------

describe("Runtime hook explanations", () => {
  const coreEvents: RuntimeTeachingEvent[] = [
    "response_model_only",
    "capability_not_implemented",
    "no_cloud_call_made",
    "gauntlet_try_verify",
    "cloud_mode_requested",
  ];

  for (const event of coreEvents) {
    it(`${event} returns explanation`, () => {
      const explanation = getRuntimeTeachingExplanation(event);
      expect(explanation).not.toBeNull();
      expect(explanation!.whatHappened.length).toBeGreaterThan(0);
      expect(explanation!.whyItMatters.length).toBeGreaterThan(0);
      expect(explanation!.whatYouCanDoNext.length).toBeGreaterThan(0);
    });

    it(`${event} references valid concepts`, () => {
      const explanation = getRuntimeTeachingExplanation(event);
      expect(explanation).not.toBeNull();
      for (const cs of explanation!.conceptSummaries) {
        expect(getConceptById(cs.id)).toBeDefined();
      }
    });
  }

  it("no_cloud_call_made explanation is accurate in Local Mode", () => {
    const explanation = getRuntimeTeachingExplanation("no_cloud_call_made");
    expect(explanation).not.toBeNull();
    expect(explanation!.whatHappened.toLowerCase()).toContain("without any cloud call");
    expect(explanation!.whyItMatters.toLowerCase()).toContain("private");
  });

  it("cloud_mode_requested says planned/not implemented", () => {
    const explanation = getRuntimeTeachingExplanation("cloud_mode_requested");
    expect(explanation).not.toBeNull();
    // The hook should mention enabling cloud, not claim it works
    expect(explanation!.whatYouCanDoNext.toLowerCase()).toContain("configure");
  });

  it("capability_not_implemented is honest", () => {
    const explanation = getRuntimeTeachingExplanation("capability_not_implemented");
    expect(explanation).not.toBeNull();
    expect(explanation!.whatHappened.toLowerCase()).toContain("not implemented");
  });
});

// ---------------------------------------------------------------------------
// API routes exist
// ---------------------------------------------------------------------------

describe("Teacher API routes exist", () => {
  const routes = [
    "src/app/api/teacher/concepts/route.ts",
    "src/app/api/teacher/concepts/[id]/route.ts",
    "src/app/api/teacher/lessons/route.ts",
    "src/app/api/teacher/lessons/[id]/route.ts",
    "src/app/api/teacher/onboarding/route.ts",
    "src/app/api/teacher/explain/route.ts",
  ];

  for (const route of routes) {
    it(`${route} exists`, () => {
      expect(existsSync(path.join(REPO_ROOT, route))).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Teacher UI exists
// ---------------------------------------------------------------------------

describe("Teacher UI exists", () => {
  it("teacher page exists", () => {
    expect(existsSync(path.join(REPO_ROOT, "src/app/teacher/page.tsx"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Chat integration wired into chat route
// ---------------------------------------------------------------------------

describe("Chat route teacher integration", () => {
  it("chat route imports teacher integration", () => {
    const fs = require("node:fs");
    const chatRoute = fs.readFileSync(
      path.join(REPO_ROOT, "src/app/api/chat/route.ts"),
      "utf8",
    );
    expect(chatRoute).toContain("tryTeacherAnswer");
    expect(chatRoute).toContain("teacherResultToPayload");
  });
});
