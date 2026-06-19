import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KEYS,
  markTourCompleted,
  readFirstRunCompleted,
  readTourCompleted,
  readTourMode,
  resetFirstRun,
  restartTour,
  writeFirstRunChoice,
} from "./firstRun";

/**
 * The helpers in firstRun.ts read window.localStorage at call time. We stub
 * a minimal Storage-shaped object on globalThis.window so we can exercise
 * them in node without pulling in jsdom.
 */

let store: Record<string, string>;

const storage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => {
    store[k] = String(v);
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    store = {};
  },
  key: (i: number) => Object.keys(store)[i] ?? null,
  get length() {
    return Object.keys(store).length;
  },
} satisfies Storage;

beforeEach(() => {
  store = {};
  vi.stubGlobal("window", { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("firstRun helpers", () => {
  it("readFirstRunCompleted is false when nothing is stored", () => {
    expect(readFirstRunCompleted()).toBe(false);
  });

  it("readTourMode defaults to 'off'", () => {
    expect(readTourMode()).toBe("off");
  });

  it("readTourCompleted defaults to false", () => {
    expect(readTourCompleted()).toBe(false);
  });

  it("writeFirstRunChoice('on') persists firstRunCompleted=true and tourMode=on", () => {
    writeFirstRunChoice("on");
    expect(readFirstRunCompleted()).toBe(true);
    expect(readTourMode()).toBe("on");
    expect(store[KEYS.firstRunCompleted]).toBe("true");
    expect(store[KEYS.tourMode]).toBe("on");
  });

  it("writeFirstRunChoice('off') persists firstRunCompleted=true and tourMode=off", () => {
    writeFirstRunChoice("off");
    expect(readFirstRunCompleted()).toBe(true);
    expect(readTourMode()).toBe("off");
  });

  it("markTourCompleted turns the tour off and records completion", () => {
    writeFirstRunChoice("on");
    markTourCompleted();
    expect(readTourMode()).toBe("off");
    expect(readTourCompleted()).toBe(true);
  });

  it("restartTour turns the tour back on without affecting completion", () => {
    writeFirstRunChoice("off");
    markTourCompleted();
    expect(readTourMode()).toBe("off");
    restartTour();
    expect(readTourMode()).toBe("on");
    expect(readTourCompleted()).toBe(true);
  });

  it("resetFirstRun clears every flag", () => {
    writeFirstRunChoice("on");
    markTourCompleted();
    resetFirstRun();
    expect(readFirstRunCompleted()).toBe(false);
    expect(readTourMode()).toBe("off");
    expect(readTourCompleted()).toBe(false);
  });
});

describe("firstRun helpers when window is unavailable", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("window", undefined);
  });

  it("readers return safe defaults on the server", () => {
    expect(readFirstRunCompleted()).toBe(false);
    expect(readTourMode()).toBe("off");
    expect(readTourCompleted()).toBe(false);
  });

  it("writers no-op on the server", () => {
    expect(() => writeFirstRunChoice("on")).not.toThrow();
    expect(() => markTourCompleted()).not.toThrow();
    expect(() => restartTour()).not.toThrow();
    expect(() => resetFirstRun()).not.toThrow();
  });
});
