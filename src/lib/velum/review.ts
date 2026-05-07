export type VelumRisk = "low" | "medium" | "high";
export type VelumSeverity = "low" | "medium" | "high";

export interface VelumFinding {
  id: string;
  category:
    | "secret"
    | "credential"
    | "email"
    | "phone"
    | "location"
    | "prompt-injection"
    | "personal-id";
  severity: VelumSeverity;
  label: string;
  explanation: string;
  matchedPreview: string;
}

export interface VelumReviewResult {
  overallRisk: VelumRisk;
  findings: VelumFinding[];
  localOnly: true;
  cloudUsed: false;
  modelUsed: false;
}

interface Detector {
  category: VelumFinding["category"];
  severity: VelumSeverity;
  label: string;
  explanation: string;
  pattern: RegExp;
  redactAs?: string;
  sensitive?: boolean;
}

const DETECTORS: readonly Detector[] = [
  {
    category: "secret",
    severity: "high",
    label: "Possible API key or token",
    explanation:
      "This looks like a secret token or API key. Anyone who sees it may be able to use an account or service as you.",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|auth[_-]?token|bearer)\b\s*[:=]\s*["']?([A-Za-z0-9._\-]{16,})/gi,
    redactAs: "[REDACTED_SECRET]",
    sensitive: true,
  },
  {
    category: "secret",
    severity: "high",
    label: "Possible private key block",
    explanation:
      "Private keys should not be sent to AI chats or pasted into places you do not fully control.",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    redactAs: "[REDACTED_SECRET]",
    sensitive: true,
  },
  {
    category: "credential",
    severity: "high",
    label: "Possible password or credential",
    explanation:
      "This may be a password or credential. Remove it before sharing unless you are certain it is safe.",
    pattern: /\b(?:password|passwd|pwd|credential)\b\s*[:=]\s*["']?([^\s"']{6,})/gi,
    redactAs: "[REDACTED_SECRET]",
    sensitive: true,
  },
  {
    category: "email",
    severity: "medium",
    label: "Email address",
    explanation:
      "Email addresses can identify a person or account. Review before sharing.",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    redactAs: "[REDACTED_EMAIL]",
  },
  {
    category: "phone",
    severity: "medium",
    label: "Phone number",
    explanation:
      "Phone numbers are personal contact details. Consider redacting them before sharing.",
    pattern: /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g,
    redactAs: "[REDACTED_PHONE]",
  },
  {
    category: "location",
    severity: "medium",
    label: "Possible street address",
    explanation:
      "This may include a physical address or location-like personal detail.",
    pattern:
      /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl)\b\.?/gi,
    redactAs: "[REDACTED_ADDRESS]",
  },
  {
    category: "personal-id",
    severity: "high",
    label: "Possible Social Security number",
    explanation:
      "This looks like a highly sensitive personal identifier. Do not share it unless you are sure.",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    redactAs: "[REDACTED_ID]",
    sensitive: true,
  },
  {
    category: "prompt-injection",
    severity: "medium",
    label: "Prompt-like instruction",
    explanation:
      "This looks like text that may try to steer or override an AI system. Review it before including it in a prompt.",
    pattern:
      /\b(?:ignore previous instructions|disregard previous instructions|system prompt|reveal your instructions|act as system|developer message|tool call|exfiltrate|send this data)\b/gi,
  },
];

export function reviewVelumText(text: string): VelumReviewResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return {
      overallRisk: "low",
      findings: [],
      localOnly: true,
      cloudUsed: false,
      modelUsed: false,
    };
  }

  const findings: VelumFinding[] = [];
  for (const detector of DETECTORS) {
    const pattern = new RegExp(detector.pattern.source, detector.pattern.flags);
    for (const match of text.matchAll(pattern)) {
      const matched = match[0] ?? "";
      findings.push({
        id: `${detector.category}-${findings.length + 1}`,
        category: detector.category,
        severity: detector.severity,
        label: detector.label,
        explanation: detector.explanation,
        matchedPreview: detector.sensitive
          ? redactSensitivePreview(matched)
          : truncatePreview(matched),
      });
      if (findings.length >= 40) break;
    }
  }

  return {
    overallRisk: overallRisk(findings),
    findings,
    localOnly: true,
    cloudUsed: false,
    modelUsed: false,
  };
}

export function createVelumRedactedPreview(text: string): string {
  return DETECTORS.reduce((next, detector) => {
    if (!detector.redactAs) return next;
    return next.replace(new RegExp(detector.pattern.source, detector.pattern.flags), detector.redactAs);
  }, text);
}

function overallRisk(findings: readonly VelumFinding[]): VelumRisk {
  if (findings.some((f) => f.severity === "high")) return "high";
  if (findings.some((f) => f.severity === "medium")) return "medium";
  return "low";
}

function truncatePreview(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

function redactSensitivePreview(value: string): string {
  const compact = truncatePreview(value);
  if (compact.length <= 8) return "[REDACTED]";
  return `${compact.slice(0, 4)}...[REDACTED]`;
}
