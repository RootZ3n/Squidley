/**
 * Zero-experience simulation tests.
 *
 * Simulates a brand-new user asking beginner questions and verifies
 * that answers are plain-language, honest, and do not overclaim.
 */

import { describe, it, expect } from "vitest";
import { tryTeacherAnswer } from "./chatIntegration";
import { isTeacherIntent } from "./detect";
import {
  loadTeachingSettings,
  DEFAULT_TEACHING_SETTINGS,
  markFirstRunCompleted,
} from "./teachingSettings";
import {
  buildTeachingCard,
  buildTeachWhileChattingNote,
  EXPLAIN_THIS_LABELS,
} from "./teachingCards";
import type { RuntimeTeachingEvent } from "./types";

// ---------------------------------------------------------------------------
// Beginner questions — must be answered honestly
// ---------------------------------------------------------------------------

describe("Zero-experience beginner simulation", () => {
  const questions: { q: string; mustContain: string[]; mustNotContain: string[] }[] = [
    {
      q: "What are you?",
      mustContain: ["agent"],
      mustNotContain: [],
    },
    {
      q: "I don't know what an agent is",
      mustContain: ["agent", "plan"],
      mustNotContain: [],
    },
    {
      q: "What is a token?",
      mustContain: ["token", "word"],
      mustNotContain: [],
    },
    {
      q: "What is a tool call?",
      mustContain: ["tool"],
      mustNotContain: [],
    },
    {
      q: "Can you write a file?",
      mustContain: ["Not implemented"],
      mustNotContain: ["I wrote", "I saved", "file has been"],
    },
    {
      q: "Did anything leave my computer?",
      mustContain: ["machine", "local"],
      mustNotContain: [],
    },
    {
      q: "What does no cloud mean?",
      mustContain: ["local", "machine"],
      mustNotContain: [],
    },
    {
      q: "Why can't you browse the web?",
      mustContain: ["Not implemented"],
      mustNotContain: ["I searched", "I found"],
    },
    {
      q: "What is Cloud Mode?",
      mustContain: ["not yet implemented"],
      mustNotContain: ["is ready", "is available now", "is functional"],
    },
    {
      q: "How do I start?",
      mustContain: ["local", "Ollama"],
      mustNotContain: [],
    },
  ];

  for (const { q, mustContain, mustNotContain } of questions) {
    it(`"${q}" is detected as teacher intent`, () => {
      expect(isTeacherIntent(q)).toBe(true);
    });

    it(`"${q}" is answered by teacher layer`, () => {
      const result = tryTeacherAnswer(q, "local");
      expect(result.handled).toBe(true);
      expect(result.source).toBe("teacher_layer");
    });

    for (const word of mustContain) {
      it(`"${q}" answer contains "${word}"`, () => {
        const result = tryTeacherAnswer(q, "local");
        expect(result.reply!.toLowerCase()).toContain(word.toLowerCase());
      });
    }

    for (const word of mustNotContain) {
      it(`"${q}" answer does NOT contain "${word}"`, () => {
        const result = tryTeacherAnswer(q, "local");
        expect(result.reply!.toLowerCase()).not.toContain(word.toLowerCase());
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Honesty invariants
// ---------------------------------------------------------------------------

describe("Teacher answers do not overclaim", () => {
  it("does not claim Cloud Mode is implemented", () => {
    const result = tryTeacherAnswer("What is Cloud Mode?", "local");
    expect(result.handled).toBe(true);
    const reply = result.reply!.toLowerCase();
    expect(reply).toContain("not yet implemented");
    expect(reply).not.toContain("is ready");
    expect(reply).not.toContain("is active");
  });

  it("does not claim file tools exist", () => {
    const result = tryTeacherAnswer("Can you write a file?", "local");
    expect(result.handled).toBe(true);
    expect(result.reply!).toContain("Not implemented");
  });

  it("does not claim shell tools exist", () => {
    const result = tryTeacherAnswer("Can you run a command?", "local");
    expect(result.handled).toBe(true);
    expect(result.reply!).toContain("Not implemented");
  });

  it("does not claim web search exists", () => {
    const result = tryTeacherAnswer("Can you search the web?", "local");
    expect(result.handled).toBe(true);
    expect(result.reply!).toContain("Not implemented");
  });

  it("mentions local mode / no cloud when relevant", () => {
    const result = tryTeacherAnswer("Did anything leave my computer?", "local");
    expect(result.handled).toBe(true);
    expect(result.modeContext).toContain("Local Mode");
  });

  it("includes suggested next step", () => {
    const result = tryTeacherAnswer("What is a receipt?", "local");
    expect(result.handled).toBe(true);
    expect(result.suggestedNextLesson).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Teaching settings
// ---------------------------------------------------------------------------

describe("Teaching settings", () => {
  it("defaults have teach-while-chatting on", () => {
    expect(DEFAULT_TEACHING_SETTINGS.teachWhileChatting).toBe(true);
  });

  it("defaults have first-run not completed", () => {
    expect(DEFAULT_TEACHING_SETTINGS.firstRunCompleted).toBe(false);
  });

  it("markFirstRunCompleted sets flag", () => {
    const updated = markFirstRunCompleted(DEFAULT_TEACHING_SETTINGS);
    expect(updated.firstRunCompleted).toBe(true);
    expect(updated.teachWhileChatting).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Teaching cards
// ---------------------------------------------------------------------------

describe("Teaching cards", () => {
  const events: RuntimeTeachingEvent[] = [
    "response_model_only",
    "no_cloud_call_made",
    "capability_not_implemented",
    "cloud_mode_requested",
    "gauntlet_try_verify",
    "tool_call_blocked",
  ];

  for (const event of events) {
    it(`buildTeachingCard returns card for ${event}`, () => {
      const card = buildTeachingCard(event);
      expect(card).not.toBeNull();
      expect(card!.headline.length).toBeGreaterThan(0);
      expect(card!.body.length).toBeGreaterThan(0);
    });

    it(`buildTeachWhileChattingNote returns note for ${event}`, () => {
      const note = buildTeachWhileChattingNote(event);
      expect(note).not.toBeNull();
      expect(note!.length).toBeGreaterThan(10);
    });
  }
});

// ---------------------------------------------------------------------------
// Explain-this labels
// ---------------------------------------------------------------------------

describe("Explain-this labels", () => {
  const requiredLabels = [
    "local-mode", "cloud-mode", "no-cloud", "no-tool",
    "model-only", "receipt", "provenance", "not-implemented",
  ];

  for (const label of requiredLabels) {
    it(`label "${label}" exists`, () => {
      expect(EXPLAIN_THIS_LABELS[label]).toBeDefined();
      expect(EXPLAIN_THIS_LABELS[label].short.length).toBeGreaterThan(0);
      expect(EXPLAIN_THIS_LABELS[label].conceptId.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// First-run wizard content accuracy
// ---------------------------------------------------------------------------

describe("First-run wizard content is honest", () => {
  // Import the wizard steps from the page would require DOM; test via the
  // teacher layer answers instead to verify the same content is accurate.
  it("'What can you do?' lists capabilities honestly", () => {
    const result = tryTeacherAnswer("What can you do?", "local");
    expect(result.handled).toBe(true);
    expect(result.reply!).toContain("I can:");
    expect(result.reply!).toContain("Not implemented");
  });

  it("'What can't you do?' is honest about limitations", () => {
    const result = tryTeacherAnswer("What can't you do?", "local");
    expect(result.handled).toBe(true);
    expect(result.reply!).toContain("Not implemented");
  });
});
