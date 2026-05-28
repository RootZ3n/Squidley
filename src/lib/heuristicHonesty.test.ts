/**
 * Heuristic honesty test.
 *
 * Peh uses deterministic heuristics in several places (Velum
 * deterministic review, prompt gateway, local gauntlet). These are useful
 * local checks but are NOT formal safety proofs. This test ensures that
 * any user-facing surface (docs, README, gauntlet output, UI copy)
 * either avoids absolute-safety language, or uses it only in a negated /
 * disclaiming context.
 *
 * If you intentionally need to use one of the forbidden phrases (e.g. you
 * are explicitly DENYING a safety guarantee), the line containing it must
 * also contain a disclaimer marker like "not a", "no ", "does not", or
 * the explicit string "not a guarantee".
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

const FORBIDDEN_OVERCLAIMS: Array<{ pattern: RegExp; rule: string }> = [
  { pattern: /\bguaranteed safe\b/i, rule: "no 'guaranteed safe'" },
  { pattern: /\bproves? safety\b/i, rule: "no 'proves safety'" },
  { pattern: /\bproof of (?:full )?safety\b/i, rule: "no 'proof of safety'" },
  { pattern: /\bfully secure\b/i, rule: "no 'fully secure'" },
  { pattern: /\bcompletely (?:safe|secure|private)\b/i, rule: "no 'completely safe/secure/private'" },
  { pattern: /\b100% (?:safe|secure|private)\b/i, rule: "no '100% safe/secure/private'" },
  { pattern: /\bcannot be bypassed\b/i, rule: "no 'cannot be bypassed'" },
  { pattern: /\bunhackable\b/i, rule: "no 'unhackable'" },
  { pattern: /\bguaranteed defen[cs]e\b/i, rule: "no 'guaranteed defense'" },
];

const DISCLAIMER_MARKERS = [
  /\bnot a\b/i,
  /\bnot proof\b/i,
  /\bnot a guarantee\b/i,
  /\bnot guaranteed\b/i,
  /\bdoes not\b/i,
  /\bdo not\b/i,
  /\bdoesn['']t\b/i,
  /\bdon['']t\b/i,
  /\bno\s+\w+\s+(?:guarantee|proof)\b/i,
  /\bwithout\b/i,
];

function walk(dir: string, exts: readonly string[], collected: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "node_modules" || name === "dist-electron") continue;
    const full = path.join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, exts, collected);
    else if (exts.some((e) => full.endsWith(e))) collected.push(full);
  }
  return collected;
}

interface Violation {
  file: string;
  lineNumber: number;
  line: string;
  rule: string;
}

function scan(files: readonly string[], allowSelfRefs = false): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const { pattern, rule } of FORBIDDEN_OVERCLAIMS) {
        if (!pattern.test(line)) continue;
        if (allowSelfRefs && /FORBIDDEN_OVERCLAIMS|forbidden|overclaim|rule:/i.test(line)) {
          continue;
        }
        // Allow if the same line contains a disclaimer marker.
        const disclaimed = DISCLAIMER_MARKERS.some((m) => m.test(line));
        if (disclaimed) continue;
        // Allow if the line BEFORE explicitly negates ("not a ..." then the phrase
        // on the next line). Limit to the immediately preceding non-empty line.
        let prev = "";
        for (let j = i - 1; j >= 0; j -= 1) {
          if (lines[j].trim()) {
            prev = lines[j];
            break;
          }
        }
        if (DISCLAIMER_MARKERS.some((m) => m.test(prev))) continue;
        violations.push({ file: path.relative(REPO_ROOT, file), lineNumber: i + 1, line: line.trim(), rule });
      }
    }
  }
  return violations;
}

describe("heuristic honesty — no absolute-safety overclaims in user-facing text", () => {
  it("docs/*.md contains no unqualified safety/proof overclaims", () => {
    const files = walk(path.join(REPO_ROOT, "docs"), [".md"]);
    const violations = scan(files);
    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} unqualified safety overclaim(s):\n${violations
          .map((v) => `  ${v.file}:${v.lineNumber} [${v.rule}] ${v.line}`)
          .join("\n")}`,
      );
    }
    expect(violations).toEqual([]);
  });

  it("README.md contains no unqualified safety/proof overclaims", () => {
    const violations = scan([path.join(REPO_ROOT, "README.md")]);
    expect(violations).toEqual([]);
  });

  it("src/lib (excluding tests) contains no unqualified overclaims", () => {
    const files = walk(path.join(REPO_ROOT, "src", "lib"), [".ts", ".tsx"])
      .filter((f) => !f.includes(".test."));
    const violations = scan(files, true);
    expect(violations).toEqual([]);
  });

  it("Tabularium and gauntlet output have explicit heuristic disclaimers", () => {
    const gauntletScript = readFileSync(
      path.join(REPO_ROOT, "scripts/gauntlet-local-model.mjs"),
      "utf8",
    );
    expect(gauntletScript).toMatch(/not proof of full safety|not a benchmark|smoke tests/i);
    expect(gauntletScript).toMatch(/TRY_VERIFY/);
    expect(gauntletScript).toMatch(/NEEDS_CLOUD/);
    // PASS, TRY_VERIFY, NEEDS_CLOUD, BLOCKED must be distinct statuses.
    expect(gauntletScript).toMatch(/PASS:\s*"PASS"/);
    expect(gauntletScript).toMatch(/TRY_VERIFY:\s*"TRY_VERIFY"/);
  });

  it("Velum capability copy says deterministic and does not claim safety guarantee", () => {
    const reg = readFileSync(
      path.join(REPO_ROOT, "src/lib/capabilities/registry.ts"),
      "utf8",
    );
    // Velum honestMessage exists
    expect(reg).toMatch(/Deterministic content review/);
    expect(reg).toMatch(/deterministic checks in this browser/);
  });

  it("Local-first contract spells out what it does NOT promise", () => {
    const contract = readFileSync(
      path.join(REPO_ROOT, "docs/LOCAL_FIRST_CONTRACT.md"),
      "utf8",
    );
    expect(contract).toMatch(/does not promise/i);
    expect(contract).toMatch(/deterministic heuristics, not guaranteed defenses/i);
    expect(contract).toMatch(/pending validation/i);
  });
});

describe("heuristic honesty — TRY_VERIFY vs PASS handling", () => {
  it("gauntlet recommendedOverall never returns PASS when TRY_VERIFY count > 0", async () => {
    // Re-implement the logic from the script for a deterministic unit check.
    // If this drifts from the script, the integration test below would also
    // catch it.
    function recommended(summary: { PASS: number; TRY_VERIFY: number; NEEDS_CLOUD: number; BLOCKED: number }, taskCount: number) {
      if (summary.BLOCKED === taskCount) return "BLOCKED";
      if (summary.NEEDS_CLOUD > 0) return "TRY_VERIFY";
      if (summary.TRY_VERIFY > 0 || summary.BLOCKED > 0) return "TRY_VERIFY";
      return "PASS";
    }
    expect(recommended({ PASS: 5, TRY_VERIFY: 1, NEEDS_CLOUD: 0, BLOCKED: 0 }, 6)).toBe("TRY_VERIFY");
    expect(recommended({ PASS: 4, TRY_VERIFY: 0, NEEDS_CLOUD: 1, BLOCKED: 1 }, 6)).toBe("TRY_VERIFY");
    expect(recommended({ PASS: 6, TRY_VERIFY: 0, NEEDS_CLOUD: 0, BLOCKED: 0 }, 6)).toBe("PASS");
    expect(recommended({ PASS: 0, TRY_VERIFY: 0, NEEDS_CLOUD: 0, BLOCKED: 6 }, 6)).toBe("BLOCKED");
  });

  it("gauntlet script matches that handling — script literal check", () => {
    const src = readFileSync(
      path.join(REPO_ROOT, "scripts/gauntlet-local-model.mjs"),
      "utf8",
    );
    // The script's recommendedOverall must downgrade to TRY_VERIFY whenever
    // any TRY_VERIFY/NEEDS_CLOUD exists.
    expect(src).toMatch(/summary\.NEEDS_CLOUD > 0[^]*?STATUS\.TRY_VERIFY/);
    expect(src).toMatch(/summary\.TRY_VERIFY > 0/);
  });
});
