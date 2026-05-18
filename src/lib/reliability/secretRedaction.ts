/**
 * Best-effort secret redaction for file contents before they enter the
 * context packer.
 *
 * This is NOT a perfect secret scanner. We catch obvious patterns:
 *   - sk-* / pk-* (OpenAI, Stripe-style)
 *   - sk-or-* (OpenRouter)
 *   - sk-ant-* (Anthropic)
 *   - ghp_* / gho_* / ghu_* / ghs_* / ghr_* / github_pat_* (GitHub)
 *   - xox[bpa]-* (Slack)
 *   - AKIA[A-Z0-9]{16} (AWS access key id)
 *   - PEM blocks ("-----BEGIN ... PRIVATE KEY-----")
 *   - JWT-looking eyJ.* strings
 *   - Authorization: Bearer <token>
 *   - .env-style KEY=value where KEY is sensitive (PASSWORD, SECRET, TOKEN, KEY)
 *
 * Limitations (documented for tests + docs):
 *   - We will MISS hand-rolled custom token formats.
 *   - We will MISS encoded/obfuscated secrets.
 *   - We will MISS multi-line keys that don't use PEM markers.
 *   - We may over-redact things that look key-shaped but aren't.
 *
 * The orchestrator surfaces a `redactionsApplied` count + categories so
 * the user knows redaction ran. If you need certainty, don't ship the
 * file — refuse it at the path-safety layer.
 */

export type SecretRedactionCategory =
  | "api-key"
  | "github-token"
  | "openai-anthropic-token"
  | "openrouter-token"
  | "slack-token"
  | "aws-access-key-id"
  | "pem-private-key"
  | "jwt"
  | "bearer-token"
  | "env-sensitive-assignment"
  | "ssh-private-blob";

interface RedactionRule {
  readonly category: SecretRedactionCategory;
  readonly pattern: RegExp;
  readonly redactedValue: (match: string) => string;
}

const KEEP_PREFIX_LEN = 4;

function mask(match: string, category: SecretRedactionCategory): string {
  const prefix = match.slice(0, KEEP_PREFIX_LEN);
  return `${prefix}…[redacted:${category}]`;
}

const RULES: readonly RedactionRule[] = [
  {
    category: "openai-anthropic-token",
    pattern: /\bsk-(?:ant-)?[A-Za-z0-9_\-]{16,}/g,
    redactedValue: (m) => mask(m, "openai-anthropic-token"),
  },
  {
    category: "openrouter-token",
    pattern: /\bsk-or-[A-Za-z0-9_\-]{16,}/g,
    redactedValue: (m) => mask(m, "openrouter-token"),
  },
  {
    category: "github-token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    redactedValue: (m) => mask(m, "github-token"),
  },
  {
    category: "slack-token",
    pattern: /\bxox[bpaors]-[A-Za-z0-9-]{8,}\b/g,
    redactedValue: (m) => mask(m, "slack-token"),
  },
  {
    category: "aws-access-key-id",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    redactedValue: (m) => mask(m, "aws-access-key-id"),
  },
  {
    category: "pem-private-key",
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----/g,
    redactedValue: () => "[redacted:pem-private-key]",
  },
  {
    category: "ssh-private-blob",
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
    redactedValue: () => "[redacted:ssh-private-blob]",
  },
  {
    category: "jwt",
    pattern: /\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g,
    redactedValue: (m) => mask(m, "jwt"),
  },
  {
    category: "bearer-token",
    pattern: /(?<=\bAuthorization:\s*Bearer\s+)[A-Za-z0-9._\-]{12,}/gi,
    redactedValue: () => "[redacted:bearer-token]",
  },
  {
    category: "env-sensitive-assignment",
    pattern:
      /\b([A-Z][A-Z0-9_]{2,}(?:PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY)[A-Z0-9_]*)\s*[=:]\s*["']?([^"'\s\n]{6,})["']?/g,
    redactedValue: (m) => {
      const [, name] = m.match(
        /\b([A-Z][A-Z0-9_]{2,}(?:PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY)[A-Z0-9_]*)/,
      ) ?? [];
      return `${name ?? "VAR"}=[redacted:env-sensitive]`;
    },
  },
  {
    category: "api-key",
    pattern: /\bpk_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    redactedValue: (m) => mask(m, "api-key"),
  },
];

export interface RedactionApplied {
  readonly category: SecretRedactionCategory;
  readonly count: number;
}

export interface RedactionResult {
  readonly content: string;
  readonly applied: readonly RedactionApplied[];
  readonly anyApplied: boolean;
}

export function redactSecrets(input: string): RedactionResult {
  if (typeof input !== "string" || input.length === 0) {
    return { content: "", applied: [], anyApplied: false };
  }
  let content = input;
  const applied: RedactionApplied[] = [];
  for (const rule of RULES) {
    let count = 0;
    content = content.replace(rule.pattern, (m) => {
      count += 1;
      return rule.redactedValue(m);
    });
    if (count > 0) applied.push({ category: rule.category, count });
  }
  return { content, applied, anyApplied: applied.length > 0 };
}

/** Honest disclaimer for the approval card and receipts. */
export const SECRET_REDACTION_DISCLAIMER =
  "Squidley redacts obvious secrets before reading (API keys, GitHub tokens, PEM blocks, bearer tokens, sensitive .env-style assignments). Custom or obfuscated secret formats can still slip through. If a file might contain secrets and you are not sure, do not approve the read.";
