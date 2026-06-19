import { describe, it, expect } from "vitest";
import { SECRET_REDACTION_DISCLAIMER, redactSecrets } from "./secretRedaction";

describe("redactSecrets — common token formats", () => {
  it("redacts OpenAI / Anthropic style sk- tokens", () => {
    const r = redactSecrets("const k = 'sk-abcdefghijklmnopqrstuvwxyz12';");
    expect(r.anyApplied).toBe(true);
    expect(r.content).not.toMatch(/sk-abcdefghijklmnopqrstuvwxyz12/);
    expect(r.content).toMatch(/openai-anthropic-token/);
  });

  it("redacts sk-ant- Anthropic tokens distinctly", () => {
    const r = redactSecrets("OPENAI=sk-ant-1234567890abcdefghij");
    expect(r.anyApplied).toBe(true);
    expect(r.content).not.toMatch(/sk-ant-1234567890abcdefghij/);
  });

  it("redacts OpenRouter sk-or- tokens", () => {
    const r = redactSecrets("X: sk-or-abcdefghijklmnop12345");
    expect(r.anyApplied).toBe(true);
    expect(r.content).not.toMatch(/sk-or-abcdefghijklmnop12345/);
  });

  it("redacts every GitHub token shape", () => {
    const samples = [
      "ghp_aaaaaaaaaaaaaaaaaaaaaaaa",
      "gho_bbbbbbbbbbbbbbbbbbbbbbbb",
      "ghs_cccccccccccccccccccccccc",
      "ghr_dddddddddddddddddddddddd",
      "ghu_eeeeeeeeeeeeeeeeeeeeeeee",
      "github_pat_aaaaaaaa_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ];
    for (const token of samples) {
      const r = redactSecrets(`token = '${token}'`);
      expect(r.anyApplied).toBe(true);
      expect(r.content).not.toMatch(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("redacts Slack xoxb / xoxp / xoxa tokens", () => {
    const r = redactSecrets("SLACK_TOKEN=xoxb-12345-abcdefg");
    expect(r.anyApplied).toBe(true);
    expect(r.content).not.toMatch(/xoxb-12345-abcdefg/);
  });

  it("redacts AWS access key IDs", () => {
    const r = redactSecrets("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE");
    expect(r.anyApplied).toBe(true);
    expect(r.content).not.toMatch(/AKIAIOSFODNN7EXAMPLE/);
  });

  it("redacts PEM private keys", () => {
    const pem = [
      "-----BEGIN PRIVATE KEY-----",
      "MIIEvQIBADANBgkqhkiG9w0BAQEFAAS",
      "CBKcwggSjAgEAAoIBAQC...",
      "-----END PRIVATE KEY-----",
    ].join("\n");
    const r = redactSecrets(pem);
    expect(r.anyApplied).toBe(true);
    expect(r.content).toMatch(/redacted:pem-private-key/);
    expect(r.content).not.toMatch(/MIIEvQIBADANBgkqhkiG9w0BAQEFAAS/);
  });

  it("redacts JWT-shaped strings", () => {
    const r = redactSecrets(
      "header: eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NTY3.SflKxwRJSMeKKFflKx",
    );
    expect(r.anyApplied).toBe(true);
    expect(r.content).not.toMatch(
      /eyJhbGciOiJIUzI1NiIs\.eyJzdWIiOiIxMjM0NTY3\.SflKxwRJSMeKKFflKx/,
    );
  });

  it("redacts Authorization Bearer headers", () => {
    const r = redactSecrets("Authorization: Bearer abcdefghijklmnopqrst");
    expect(r.anyApplied).toBe(true);
    expect(r.content).not.toMatch(/abcdefghijklmnopqrst/);
    expect(r.content).toMatch(/Bearer \[redacted:bearer-token\]/);
  });

  it("redacts .env-style sensitive assignments", () => {
    const r = redactSecrets("DATABASE_PASSWORD=supersecretvalue123");
    expect(r.anyApplied).toBe(true);
    expect(r.content).not.toMatch(/supersecretvalue123/);
    const r2 = redactSecrets("MY_API_KEY = 'aaaaaaaaaaaaa'");
    expect(r2.anyApplied).toBe(true);
  });
});

describe("redactSecrets — does not over-redact normal code", () => {
  it("leaves ordinary identifiers and English text alone", () => {
    const r = redactSecrets("const helloWorld = 'hello, world!';");
    expect(r.anyApplied).toBe(false);
    expect(r.content).toBe("const helloWorld = 'hello, world!';");
  });

  it("leaves a public-looking pk_test_ Stripe key alone unless long enough", () => {
    // Short identifier 'pk_test_' should NOT trigger redaction.
    const r = redactSecrets("const key = pk_test_short;");
    expect(r.anyApplied).toBe(false);
  });

  it("redacts long Stripe-style pk_live_ keys", () => {
    const r = redactSecrets("const k = 'pk_live_abcdefghijklmnopqrst';");
    expect(r.anyApplied).toBe(true);
  });
});

describe("redactSecrets — invariants", () => {
  it("returns empty result for empty input without throwing", () => {
    const r = redactSecrets("");
    expect(r.anyApplied).toBe(false);
    expect(r.content).toBe("");
  });

  it("counts every match per category", () => {
    const r = redactSecrets(
      [
        "TOKEN_A=sk-aaaaaaaaaaaaaaaaaaaa",
        "TOKEN_B=sk-bbbbbbbbbbbbbbbbbbbb",
      ].join("\n"),
    );
    const sk = r.applied.find((a) => a.category === "openai-anthropic-token");
    expect(sk?.count).toBeGreaterThanOrEqual(2);
  });

  it("disclaimer text is honest about limits", () => {
    expect(SECRET_REDACTION_DISCLAIMER).toMatch(/can still slip through/);
  });
});
