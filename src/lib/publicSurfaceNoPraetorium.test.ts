/**
 * Public surface contract — no Praetorium / Praertorium references.
 *
 * Praetorium is a LAB-ONLY module. It must not appear in Public
 * Peh's user-facing surfaces: terminology, navigation, capability
 * registries, tool matrices, teacher KB, beginner docs, or release
 * docs.
 *
 * This test scans the public surface for any occurrence of:
 *   - "Praetorium" / "Praertorium" (both spellings used in the lab)
 *   - "Policy Control" as a standalone module label
 *   - "policy-control" as a slug
 *
 * It explicitly excludes its own filename so the assertion list itself
 * is not a violation. It also allows the generic phrase "policy
 * controls" in security/prompt-injection copy (that phrase describes
 * the policy-bypass attack category, not the Praetorium module).
 *
 * If you legitimately need to add a developer-only architecture note,
 * gate it inside a `docs/internal/` directory which this scanner does
 * not visit.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; rule: string }> = [
  { pattern: /\bpraertorium\b/i, rule: "no 'Praertorium' on public surface" },
  { pattern: /\bpraetorium\b/i, rule: "no 'Praetorium' on public surface" },
  { pattern: /\bpolicy[ -]control\b/i, rule: "no 'Policy Control' / 'policy-control' on public surface" },
];

const ALLOWLIST_FILES = new Set<string>([
  // This test file itself names the forbidden tokens to assert against them.
  path.join("src", "lib", "publicSurfaceNoPraetorium.test.ts"),
  // The terminology test asserts the absence of the module key by name.
  path.join("src", "lib", "ui", "terminology.test.ts"),
]);

// Lines that legitimately use a forbidden substring for non-module reasons.
// Currently: the policy-bypass detector in promptInjection.ts uses the
// phrase "policy controls" in a generic sense (attack category description),
// not as a Praetorium module reference.
const LINE_ALLOWLIST: Array<{ file: string; substring: string }> = [
  {
    file: path.join("src", "lib", "security", "promptInjection.ts"),
    substring: "Attempts to bypass safety or policy controls.",
  },
];

const SCAN_EXTENSIONS = [".ts", ".tsx", ".md", ".json", ".mjs", ".js"];
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".next",
  "dist-electron",
  "reports",
  ".git",
]);

function walk(dir: string, collected: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return collected;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    if (EXCLUDED_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(full, collected);
    } else if (SCAN_EXTENSIONS.some((ext) => full.endsWith(ext))) {
      collected.push(full);
    }
  }
  return collected;
}

interface Violation {
  file: string;
  lineNumber: number;
  line: string;
  rule: string;
}

function isLineAllowed(file: string, line: string): boolean {
  for (const allow of LINE_ALLOWLIST) {
    if (file === allow.file && line.includes(allow.substring)) return true;
  }
  return false;
}

function scan(files: readonly string[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file);
    if (ALLOWLIST_FILES.has(rel)) continue;
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const { pattern, rule } of FORBIDDEN_PATTERNS) {
        if (!pattern.test(line)) continue;
        if (isLineAllowed(rel, line)) continue;
        violations.push({ file: rel, lineNumber: i + 1, line: line.trim(), rule });
      }
    }
  }
  return violations;
}

describe("public surface — no Praetorium / Praertorium references", () => {
  it("src/ contains no Praetorium / Praertorium / Policy Control references", () => {
    const files = walk(path.join(REPO_ROOT, "src"));
    const violations = scan(files);
    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} lab-only Praetorium reference(s) on public surface:\n${violations
          .map((v) => `  ${v.file}:${v.lineNumber} [${v.rule}] ${v.line}`)
          .join("\n")}`,
      );
    }
    expect(violations).toEqual([]);
  });

  it("docs/ contains no Praetorium / Praertorium / Policy Control references", () => {
    const files = walk(path.join(REPO_ROOT, "docs"));
    const violations = scan(files);
    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} lab-only Praetorium reference(s) in public docs:\n${violations
          .map((v) => `  ${v.file}:${v.lineNumber} [${v.rule}] ${v.line}`)
          .join("\n")}`,
      );
    }
    expect(violations).toEqual([]);
  });

  it("scripts/ contains no Praetorium / Praertorium / Policy Control references", () => {
    const files = walk(path.join(REPO_ROOT, "scripts"));
    const violations = scan(files);
    expect(violations).toEqual([]);
  });

  it("public README contains no Praetorium / Praertorium references", () => {
    const readme = readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
    expect(readme.toLowerCase()).not.toMatch(/praertorium/);
    expect(readme.toLowerCase()).not.toMatch(/praetorium/);
  });

  it("the capability matrix JSON contains no Praetorium row", () => {
    const matrix = JSON.parse(
      readFileSync(
        path.join(REPO_ROOT, "docs/capability-matrix.public-squidley.json"),
        "utf8",
      ),
    ) as { rows: Array<{ capabilityId: string }> };
    for (const row of matrix.rows) {
      expect(row.capabilityId.toLowerCase()).not.toMatch(/praertorium|praetorium/);
      expect(row.capabilityId.toLowerCase()).not.toMatch(/policy-control/);
    }
  });

  it("the tool matrix JSON contains no Praetorium tool", () => {
    const matrix = JSON.parse(
      readFileSync(
        path.join(REPO_ROOT, "docs/tool-matrix.public-squidley.json"),
        "utf8",
      ),
    ) as { tools: Array<{ toolId: string }> };
    for (const tool of matrix.tools) {
      expect(tool.toolId.toLowerCase()).not.toMatch(/praertorium|praetorium/);
      expect(tool.toolId.toLowerCase()).not.toMatch(/policy-control/);
    }
  });

  it("the line-allowlist exists only for non-module generic phrasing in promptInjection.ts", () => {
    // Sanity check: the only line we exempt is the generic "policy
    // controls" phrase in the prompt-injection category description.
    // If that file moves or the phrase changes, this test should be
    // updated deliberately, not silently.
    expect(LINE_ALLOWLIST).toHaveLength(1);
    expect(LINE_ALLOWLIST[0]?.file.endsWith("promptInjection.ts")).toBe(true);
    const source = readFileSync(
      path.join(REPO_ROOT, LINE_ALLOWLIST[0]!.file),
      "utf8",
    );
    expect(source).toContain(LINE_ALLOWLIST[0]!.substring);
  });
});
