import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP_DIR = join(process.cwd(), "src/app");
const PAGE_FILE_RE = /\.(ts|tsx)$/;

const INLINE_RECEIPT_PATTERNS = [
  /\blogTabulariumReceipt\s*\([^)]*,\s*\{/s,
  /\baddTabulariumReceipt\s*\([^)]*,\s*\{/s,
  /\bsaveTabulariumReceipt\s*\([^)]*,\s*\{/s,
];

describe("receipt ownership boundary", () => {
  it("keeps Tabularium receipt payload construction out of app page files", () => {
    const offenders = appSourceFiles(APP_DIR)
      .map((file) => ({
        file,
        source: stripComments(readFileSync(file, "utf8")),
      }))
      .filter(({ source }) => INLINE_RECEIPT_PATTERNS.some((pattern) => pattern.test(source)))
      .map(({ file }) => relative(process.cwd(), file));

    expect(
      offenders,
      [
        "Use a module-owned receipt builder instead of constructing Tabularium payloads inline in page files.",
        "Allowed flow: module receipt builder -> Tabularium log/store helper -> UI display.",
        "If this is a false positive, narrow the boundary-test pattern instead of removing the test.",
      ].join(" "),
    ).toEqual([]);
  });
});

function appSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return appSourceFiles(path);
    return PAGE_FILE_RE.test(path) ? [path] : [];
  });
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}
