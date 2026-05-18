import { describe, it, expect } from "vitest";
import {
  ALLOWED_INSPECT_EXTENSIONS,
  BLOCKED_DIR_SEGMENTS,
  FILE_INSPECTION_SAFETY_RULES,
  MAX_INSPECT_FILE_BYTES,
  checkInspectPath,
} from "./fileSafety";

const ROOT = "/repo";

describe("fileSafety/checkInspectPath — accepts safe paths", () => {
  it("accepts a relative source file inside the root", () => {
    const r = checkInspectPath("src/app/page.tsx", { projectRoot: ROOT });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.relativePath).toBe("src/app/page.tsx");
      expect(r.absolutePath).toBe("/repo/src/app/page.tsx");
      expect(r.basename).toBe("page.tsx");
      expect(r.extension).toBe(".tsx");
    }
  });

  it("accepts an absolute path that resolves inside the root", () => {
    const r = checkInspectPath("/repo/package.json", { projectRoot: ROOT });
    expect(r.ok).toBe(true);
  });

  it("accepts every allowed extension at least once", () => {
    for (const ext of ALLOWED_INSPECT_EXTENSIONS) {
      const r = checkInspectPath(`docs/example${ext}`, { projectRoot: ROOT });
      expect(r.ok).toBe(true);
    }
  });
});

describe("fileSafety/checkInspectPath — blocks unsafe paths", () => {
  it("rejects empty / non-string", () => {
    expect(checkInspectPath("", { projectRoot: ROOT }).ok).toBe(false);
    expect(checkInspectPath("   ", { projectRoot: ROOT }).ok).toBe(false);
    expect(checkInspectPath(123 as unknown as string, { projectRoot: ROOT }).ok).toBe(false);
    expect(checkInspectPath(null as unknown as string, { projectRoot: ROOT }).ok).toBe(false);
  });

  it("rejects any path containing '..'", () => {
    const r = checkInspectPath("src/../package.json", { projectRoot: ROOT });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("traversal-rejected");
  });

  it("rejects absolute paths outside the root", () => {
    const r = checkInspectPath("/etc/passwd", { projectRoot: ROOT });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("absolute-outside-root");
  });

  it("rejects paths that resolve outside the root after sneaky inputs", () => {
    // '/repos2/file.ts' — looks similar to '/repo' but differs.
    const r = checkInspectPath("/repos2/file.ts", { projectRoot: ROOT });
    expect(r.ok).toBe(false);
  });

  it("rejects every blocked directory segment", () => {
    for (const seg of BLOCKED_DIR_SEGMENTS) {
      const r = checkInspectPath(`${seg}/something.ts`, { projectRoot: ROOT });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("blocked-dir-segment");
    }
  });

  it("rejects blocked basenames regardless of extension", () => {
    const blocked = [
      ".env",
      ".env.production",
      ".npmrc",
      ".netrc",
      "id_rsa",
      "id_ed25519.pub",
      "private.pem",
      "server.key",
      "cert.crt",
      "key.p12",
      "known_hosts",
      "authorized_keys",
      "secrets.json",
      "credentials.json",
    ];
    for (const name of blocked) {
      const r = checkInspectPath(`config/${name}`, { projectRoot: ROOT });
      expect(r.ok).toBe(false);
    }
  });

  it("rejects unsupported extensions", () => {
    const r = checkInspectPath("data/binary.bin", { projectRoot: ROOT });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("extension-not-allowed");
  });

  it("rejects files above MAX_INSPECT_FILE_BYTES", () => {
    const r = checkInspectPath("src/app/page.tsx", {
      projectRoot: ROOT,
      fileSize: MAX_INSPECT_FILE_BYTES + 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("file-too-large");
  });

  it("rejects when project root is not absolute", () => {
    const r = checkInspectPath("file.ts", { projectRoot: "relative/path" });
    expect(r.ok).toBe(false);
  });
});

describe("fileSafety — safety rules surface", () => {
  it("exposes a non-empty rules list for the approval UI", () => {
    expect(FILE_INSPECTION_SAFETY_RULES.length).toBeGreaterThan(0);
    expect(FILE_INSPECTION_SAFETY_RULES.join("\n")).toMatch(/'\.\.'/);
    expect(FILE_INSPECTION_SAFETY_RULES.join("\n")).toMatch(/\.env/);
  });
});
