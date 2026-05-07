/**
 * Gateway prompt-injection defense preflight.
 *
 * Deterministic, rule-based assessment of user-supplied text for prompt
 * injection patterns before it influences tool use, cloud escalation,
 * capability routing, or receipt-producing workflows.
 *
 * This is a classification layer, not a model call. It produces an
 * assessment with recommended actions — callers decide enforcement.
 *
 * Hard constraints:
 *   - Pure. No fetch. No provider calls. No cloud calls. No model calls.
 *   - No localStorage writes.
 *   - Receipt metadata must not include raw prompt contents.
 *   - safeExcerpt is length-limited and sanitized.
 */

import { sanitizePreview } from "./promptGateway";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptInjectionRiskLevel =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type PromptInjectionCategory =
  | "instruction-override"
  | "policy-bypass"
  | "tool-hijack"
  | "cloud-escalation-hijack"
  | "receipt-suppression"
  | "secret-exfiltration"
  | "data-exfiltration"
  | "role-impersonation"
  | "delimiter-confusion"
  | "hidden-instruction"
  | "external-content-injection"
  | "unknown";

export type PromptInjectionRecommendedAction =
  | "allow"
  | "warn"
  | "require-velum-review"
  | "block-tool-use"
  | "block-cloud-escalation"
  | "block";

export interface PromptInjectionFinding {
  category: PromptInjectionCategory;
  riskLevel: PromptInjectionRiskLevel;
  reason: string;
  matchedPatternId: string;
  safeExcerpt?: string;
  recommendedAction: PromptInjectionRecommendedAction;
}

export interface PromptInjectionAssessment {
  riskLevel: PromptInjectionRiskLevel;
  categories: readonly PromptInjectionCategory[];
  findings: readonly PromptInjectionFinding[];
  recommendedAction: PromptInjectionRecommendedAction;
  shouldBlockToolUse: boolean;
  shouldBlockCloudEscalation: boolean;
  shouldRequireVelumReview: boolean;
  shouldWarnUser: boolean;
  safeSummary: string;
  receiptHint: {
    riskLevel: PromptInjectionRiskLevel;
    findingCount: number;
    categories: string;
    recommendedAction: PromptInjectionRecommendedAction;
  };
}

export interface PromptInjectionOptions {
  /** Treat input as untrusted pasted content (lower severity). */
  isUntrustedContent?: boolean;
}

// ---------------------------------------------------------------------------
// Pattern rules
// ---------------------------------------------------------------------------

interface PatternRule {
  id: string;
  category: PromptInjectionCategory;
  riskLevel: PromptInjectionRiskLevel;
  reason: string;
  recommendedAction: PromptInjectionRecommendedAction;
  patterns: RegExp[];
}

const RULES: readonly PatternRule[] = [
  // --- Instruction override ---
  {
    id: "instr-override-ignore",
    category: "instruction-override",
    riskLevel: "critical",
    reason: "Attempts to override system/developer instructions.",
    recommendedAction: "block",
    patterns: [
      /\bignore (?:all )?(?:previous|prior|above|earlier) instructions?\b/i,
      /\bdisregard (?:all )?(?:previous|prior|above|earlier) instructions?\b/i,
      /\bforget (?:all )?(?:your|the|previous|prior) instructions?\b/i,
    ],
  },
  {
    id: "instr-override-new-role",
    category: "instruction-override",
    riskLevel: "high",
    reason: "Attempts to redefine system identity or role.",
    recommendedAction: "block",
    patterns: [
      /\byou are now\b/i,
      /\bact as (?:the )?system\b/i,
      /\bnew developer message\b/i,
      /\bsystem prompt says\b/i,
    ],
  },
  // --- Policy bypass ---
  {
    id: "policy-bypass",
    category: "policy-bypass",
    riskLevel: "critical",
    reason: "Attempts to bypass safety or policy controls.",
    recommendedAction: "block",
    patterns: [
      /\bdisable (?:the )?(?:safety|guardrails?|policy|rules?)\b/i,
      /\bbypass (?:the )?(?:safety|guardrails?|policy|rules?|approval)\b/i,
      /\bjailbreak\b/i,
      /\boverride (?:the )?(?:system|developer|safety|policy) (?:message|instructions?|rules?)\b/i,
    ],
  },
  // --- Tool hijack ---
  {
    id: "tool-hijack",
    category: "tool-hijack",
    riskLevel: "high",
    reason: "Attempts to invoke tools or bypass confirmation.",
    recommendedAction: "block-tool-use",
    patterns: [
      /\bcall this tool\b/i,
      /\buse (?:the )?hidden tool\b/i,
      /\bexecute without asking\b/i,
      /\bapprove automatically\b/i,
      /\bdo not ask for confirmation\b/i,
      /\bbypass approval\b/i,
      /\brun (?:a )?(?:shell )?command\b/i,
      /\bexecute (?:this )?(?:command|shell|script)\b/i,
    ],
  },
  // --- Cloud escalation hijack ---
  {
    id: "cloud-hijack",
    category: "cloud-escalation-hijack",
    riskLevel: "critical",
    reason: "Attempts to force cloud use or bypass consent/Velum.",
    recommendedAction: "block-cloud-escalation",
    patterns: [
      /\bsend (?:this )?to (?:the )?cloud\b/i,
      /\buse cloud without consent\b/i,
      /\bskip velum\b/i,
      /\bdo not redact\b/i,
      /\bignore redaction\b/i,
      /\bno need for consent\b/i,
      /\bbypass (?:the )?cloud (?:consent|approval)\b/i,
    ],
  },
  // --- Receipt suppression ---
  {
    id: "receipt-suppression",
    category: "receipt-suppression",
    riskLevel: "high",
    reason: "Attempts to suppress audit logging or receipts.",
    recommendedAction: "block",
    patterns: [
      /\bdo not log this\b/i,
      /\bdon't log this\b/i,
      /\bdo not write a receipt\b/i,
      /\bdon't write a receipt\b/i,
      /\bhide this from tabularium\b/i,
      /\bdon't tell the user\b/i,
      /\bdo not tell the user\b/i,
      /\bomit (?:this )?from (?:the )?audit\b/i,
    ],
  },
  // --- Secret exfiltration ---
  {
    id: "secret-exfil",
    category: "secret-exfiltration",
    riskLevel: "critical",
    reason: "Attempts to extract secrets or credentials.",
    recommendedAction: "block",
    patterns: [
      /\breveal (?:the )?api key\b/i,
      /\bprint secrets?\b/i,
      /\bdump env\b/i,
      /\bshow (?:me )?(?:the )?(?:api[- ]?key|secret|token|password)\b/i,
    ],
  },
  // --- Data exfiltration ---
  {
    id: "data-exfil",
    category: "data-exfiltration",
    riskLevel: "critical",
    reason: "Attempts to exfiltrate or upload local data.",
    recommendedAction: "block",
    patterns: [
      /\bexfiltrate\b/i,
      /\bread private files? and send\b/i,
      /\bupload local data\b/i,
      /\bsend (?:all )?(?:local )?data to\b/i,
    ],
  },
  // --- Role impersonation ---
  {
    id: "role-impersonation",
    category: "role-impersonation",
    riskLevel: "high",
    reason: "Attempts to impersonate system, developer, or admin roles.",
    recommendedAction: "block",
    patterns: [
      /^SYSTEM:/m,
      /^DEVELOPER:/m,
      /^ADMIN:/m,
      /\bassistant note:/i,
      /\btrusted instruction:/i,
      /\bpolicy update:/i,
    ],
  },
  // --- Delimiter confusion ---
  {
    id: "delimiter-confusion",
    category: "delimiter-confusion",
    riskLevel: "medium",
    reason: "Uses delimiters or formatting to hide instructions.",
    recommendedAction: "require-velum-review",
    patterns: [
      /\btext after this is secret instruction\b/i,
      /\banything inside quotes overrides policy\b/i,
    ],
  },
  // --- Hidden instruction ---
  {
    id: "hidden-instruction",
    category: "hidden-instruction",
    riskLevel: "high",
    reason: "Embeds hidden instructions in encoded or comment text.",
    recommendedAction: "block",
    patterns: [
      /\bhidden instruction\b/i,
      /\bbase64[:\s].*(?:decode|follow|execute|obey)\b/i,
      /\bdecode (?:this|the following).{0,60}(?:follow|execute|obey)\b/i,
      /<!--[\s\S]{0,300}?(?:ignore|disregard|system prompt|tool call|run command)[\s\S]{0,300}?-->/i,
      /\/\*[\s\S]{0,300}?(?:ignore|disregard|system prompt|tool call|run command)[\s\S]{0,300}?\*\//i,
    ],
  },
];

// ---------------------------------------------------------------------------
// Risk ordering
// ---------------------------------------------------------------------------

const RISK_ORDER: Record<PromptInjectionRiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const ACTION_ORDER: Record<PromptInjectionRecommendedAction, number> = {
  allow: 0,
  warn: 1,
  "require-velum-review": 2,
  "block-tool-use": 3,
  "block-cloud-escalation": 4,
  block: 5,
};

function maxRisk(a: PromptInjectionRiskLevel, b: PromptInjectionRiskLevel): PromptInjectionRiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

function maxAction(a: PromptInjectionRecommendedAction, b: PromptInjectionRecommendedAction): PromptInjectionRecommendedAction {
  return ACTION_ORDER[a] >= ACTION_ORDER[b] ? a : b;
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

export function assessPromptInjectionRisk(
  input: string,
  options: PromptInjectionOptions = {},
): PromptInjectionAssessment {
  const text = input ?? "";
  if (text.trim().length === 0) {
    return emptyAssessment();
  }

  const findings: PromptInjectionFinding[] = [];

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const match = text.match(pattern);
      if (!match) continue;

      const riskLevel = options.isUntrustedContent
        ? downgradeRisk(rule.riskLevel)
        : rule.riskLevel;
      const action = options.isUntrustedContent
        ? downgradeAction(rule.recommendedAction)
        : rule.recommendedAction;

      findings.push({
        category: rule.category,
        riskLevel,
        reason: rule.reason,
        matchedPatternId: rule.id,
        safeExcerpt: sanitizePreview(match[0], 60),
        recommendedAction: action,
      });
      break; // one finding per rule
    }
  }

  return buildAssessment(findings);
}

export function mergePromptInjectionAssessments(
  assessments: readonly PromptInjectionAssessment[],
): PromptInjectionAssessment {
  if (assessments.length === 0) return emptyAssessment();
  if (assessments.length === 1) return assessments[0];

  const allFindings = assessments.flatMap((a) => a.findings);
  return buildAssessment([...allFindings]);
}

export function promptInjectionAssessmentToReceiptMetadata(
  assessment: PromptInjectionAssessment,
): Record<string, string | number | boolean> {
  return {
    injectionRiskLevel: assessment.riskLevel,
    injectionFindingCount: assessment.findings.length,
    injectionCategories: assessment.categories.join(", ") || "none",
    injectionRecommendedAction: assessment.recommendedAction,
    injectionShouldBlockToolUse: assessment.shouldBlockToolUse,
    injectionShouldBlockCloud: assessment.shouldBlockCloudEscalation,
    injectionShouldRequireVelum: assessment.shouldRequireVelumReview,
    injectionShouldWarnUser: assessment.shouldWarnUser,
    injectionSafeSummary: assessment.safeSummary,
  };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function emptyAssessment(): PromptInjectionAssessment {
  return {
    riskLevel: "none",
    categories: [],
    findings: [],
    recommendedAction: "allow",
    shouldBlockToolUse: false,
    shouldBlockCloudEscalation: false,
    shouldRequireVelumReview: false,
    shouldWarnUser: false,
    safeSummary: "No prompt-injection signals detected.",
    receiptHint: {
      riskLevel: "none",
      findingCount: 0,
      categories: "none",
      recommendedAction: "allow",
    },
  };
}

function buildAssessment(findings: PromptInjectionFinding[]): PromptInjectionAssessment {
  if (findings.length === 0) return emptyAssessment();

  let risk: PromptInjectionRiskLevel = "none";
  let action: PromptInjectionRecommendedAction = "allow";
  const categorySet = new Set<PromptInjectionCategory>();

  for (const f of findings) {
    risk = maxRisk(risk, f.riskLevel);
    action = maxAction(action, f.recommendedAction);
    categorySet.add(f.category);
  }

  const categories = Array.from(categorySet);
  const shouldBlockToolUse =
    action === "block-tool-use" || action === "block" ||
    findings.some((f) => f.category === "tool-hijack");
  const shouldBlockCloudEscalation =
    action === "block-cloud-escalation" || action === "block" ||
    findings.some((f) => f.category === "cloud-escalation-hijack");
  const shouldRequireVelumReview =
    action === "require-velum-review" || action === "block" ||
    RISK_ORDER[risk] >= RISK_ORDER["high"];
  const shouldWarnUser = RISK_ORDER[risk] >= RISK_ORDER["medium"];

  const safeSummary =
    `Prompt injection screening found ${findings.length} signal${findings.length === 1 ? "" : "s"}: ` +
    `${categories.join(", ")}. Risk: ${risk}. Action: ${action}.`;

  return {
    riskLevel: risk,
    categories,
    findings,
    recommendedAction: action,
    shouldBlockToolUse,
    shouldBlockCloudEscalation,
    shouldRequireVelumReview,
    shouldWarnUser,
    safeSummary,
    receiptHint: {
      riskLevel: risk,
      findingCount: findings.length,
      categories: categories.join(", ") || "none",
      recommendedAction: action,
    },
  };
}

function downgradeRisk(level: PromptInjectionRiskLevel): PromptInjectionRiskLevel {
  switch (level) {
    case "critical": return "high";
    case "high": return "medium";
    default: return level;
  }
}

function downgradeAction(action: PromptInjectionRecommendedAction): PromptInjectionRecommendedAction {
  switch (action) {
    case "block": return "require-velum-review";
    case "block-tool-use": return "require-velum-review";
    case "block-cloud-escalation": return "require-velum-review";
    default: return action;
  }
}
