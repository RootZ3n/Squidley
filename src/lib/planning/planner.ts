/**
 * Deterministic, evidence-backed planner.
 *
 * Pure: no IO, no model calls, no fetch. Tests can run this with no
 * setup beyond passing inputs.
 *
 * Inputs:
 *   - user prompt
 *   - inspected files (path + packed content, from prior approved
 *     inspections in the conversation)
 *   - prior receipts (used as "have we seen this before?" evidence)
 *
 * Output:
 *   - ExecutionPlan with explicit `known / inferred / assumed / missing`
 *     buckets carried via EvidenceRefs and PlanConfidence fields.
 *
 * Hard rules baked in:
 *   - A step never claims a file was inspected unless that file appears
 *     in `inspectedFiles`. If a step needs more files, they go into
 *     `relatedFiles` / `suggestedNextInspections`, not into `evidence`.
 *   - Risk = "blocked" produces zero executable steps and a single
 *     `ask_user` advisory step.
 *   - Confidence starts at "high" and is decremented per missing piece
 *     of evidence — it can never increase past what evidence supports.
 */

import {
  createActivityReceipt,
  type ActivityReceipt,
} from "@/lib/activity-log/receipts";
import {
  makeEvidenceId,
  makePlanId,
  makeStepId,
  type EvidenceRef,
  type ExecutionPlan,
  type PlanConfidence,
  type PlanConfidenceLevel,
  type PlanRiskLevel,
  type PlanStep,
  type PlanningReceiptAction,
} from "./types";

export interface InspectedFileEvidence {
  readonly path: string;
  /** Compact packed content from a prior safe inspection. */
  readonly packedContent: string;
  /** Approximate size in chars (used to weight confidence). */
  readonly size?: number;
}

export interface BuildPlanInput {
  readonly userGoal: string;
  readonly inspectedFiles?: readonly InspectedFileEvidence[];
  readonly priorReceipts?: readonly ActivityReceipt[];
  readonly now?: () => number;
}

interface IntentSignals {
  readonly actionVerb:
    | "explain"
    | "fix"
    | "refactor"
    | "add"
    | "remove"
    | "investigate"
    | "audit"
    | "test"
    | "deploy"
    | "unknown";
  readonly topics: readonly string[];
  readonly destructive: boolean;
  readonly blocked: boolean;
  readonly fileHints: readonly string[];
}

const VERB_PATTERNS: readonly { verb: IntentSignals["actionVerb"]; re: RegExp }[] = [
  { verb: "fix", re: /\b(?:fix|repair|resolve|patch|debug)\b/i },
  { verb: "refactor", re: /\b(?:refactor|clean up|tidy|simplif(?:y|ying)|restructure)\b/i },
  { verb: "add", re: /\b(?:add|introduce|implement|create|build|wire up)\b/i },
  { verb: "remove", re: /\b(?:remove|delete|drop|strip)\b/i },
  { verb: "explain", re: /\b(?:explain|walk me through|how does|what does)\b/i },
  { verb: "investigate", re: /\b(?:investigate|look into|find out|trace)\b/i },
  { verb: "audit", re: /\b(?:audit|review|check)\b/i },
  { verb: "test", re: /\b(?:test|verify|prove)\b/i },
  { verb: "deploy", re: /\b(?:deploy|release|ship|publish)\b/i },
];

const DESTRUCTIVE_RE = /\b(?:delete|drop|remove|truncate|rm|reset --hard)\b/i;
const BLOCKED_RE =
  /\b(?:rm\s+-rf|force\s*push|chmod\s+0?777|sudo|disable\s+all\s+safety|ignore\s+all\s+(?:previous\s+)?instructions)\b/i;

const TOPIC_KEYWORDS = [
  "auth",
  "login",
  "logout",
  "session",
  "route",
  "middleware",
  "build",
  "bundle",
  "test",
  "spec",
  "deploy",
  "ci",
  "schema",
  "migration",
  "config",
  "env",
  "ui",
  "component",
  "api",
  "stream",
  "websocket",
] as const;

const FILE_HINT_RE =
  /(?:^|[\s`'"(<])((?:\.\.?\/)?(?:[A-Za-z0-9_.\-]+\/)*[A-Za-z0-9_\-]+\.(?:ts|tsx|js|jsx|json|md|mdx|css|scss|html|yml|yaml|txt))\b/gi;

function detectSignals(prompt: string): IntentSignals {
  const lower = prompt.toLowerCase();
  const blocked = BLOCKED_RE.test(prompt);
  const destructive = !blocked && DESTRUCTIVE_RE.test(prompt);

  let actionVerb: IntentSignals["actionVerb"] = "unknown";
  for (const { verb, re } of VERB_PATTERNS) {
    if (re.test(prompt)) {
      actionVerb = verb;
      break;
    }
  }

  const topics: string[] = [];
  for (const t of TOPIC_KEYWORDS) {
    if (lower.includes(t)) topics.push(t);
  }

  const fileHints: string[] = [];
  for (const match of prompt.matchAll(FILE_HINT_RE)) {
    if (match[1] && !match[1].includes("..")) fileHints.push(match[1]);
  }

  return { actionVerb, topics, destructive, blocked, fileHints };
}

function classifyRisk(signals: IntentSignals): PlanRiskLevel {
  if (signals.blocked) return "blocked";
  if (signals.destructive) return "elevated";
  if (signals.actionVerb === "remove" || signals.actionVerb === "deploy") {
    return "elevated";
  }
  if (
    signals.actionVerb === "fix" ||
    signals.actionVerb === "refactor" ||
    signals.actionVerb === "add"
  ) {
    return "review";
  }
  return "safe";
}

function downgrade(level: PlanConfidenceLevel): PlanConfidenceLevel {
  if (level === "high") return "medium";
  if (level === "medium") return "low";
  return "low";
}

function buildReceipt(args: {
  action: PlanningReceiptAction;
  status: "info" | "succeeded" | "failed" | "interrupted";
  title: string;
  summary: string;
  metadata?: Record<string, string | number | boolean>;
  now: () => number;
}): ActivityReceipt {
  return createActivityReceipt({
    module: "system",
    action: args.action,
    status: args.status,
    title: args.title,
    summary: args.summary,
    metadata: {
      cloud_used: false,
      read_only: true,
      ...(args.metadata ?? {}),
    },
    createdAt: args.now(),
  });
}

function buildBlockedPlan(args: {
  userGoal: string;
  now: () => number;
}): ExecutionPlan {
  const id = makePlanId(args.now());
  const receipts: ActivityReceipt[] = [
    buildReceipt({
      action: "planning.blocked",
      status: "failed",
      title: "Plan refused as blocked",
      summary:
        "Peh refused to produce a plan because the request was classified as blocked risk.",
      now: args.now,
    }),
  ];
  return {
    id,
    userGoal: args.userGoal,
    confidence: {
      overall: "low",
      reasoning: "Request was classified as blocked risk before planning.",
      missingInformation: [],
      assumptions: [],
    },
    riskLevel: "blocked",
    requiresApproval: true,
    estimatedComplexity: "trivial",
    createdAt: args.now(),
    steps: [
      {
        id: makeStepId(id, 0),
        title: "Ask the user before continuing",
        summary:
          "This request looked risky. Peh does not produce an executable plan for it. The user decides what to do next.",
        status: "blocked",
        requiredInputs: [],
        suggestedTools: [],
        relatedFiles: [],
        evidenceRefs: [],
        blockedReason: "Request risk classification = blocked.",
        userConfirmationRequired: true,
      },
    ],
    evidence: {},
    limitations: [
      "Peh does not act on blocked requests.",
      "Peh cannot bypass its own safety classification.",
    ],
    suggestedNextInspections: [],
    receipts,
    cloudUsed: false,
    localOnly: true,
  };
}

function buildSteps(args: {
  planId: string;
  signals: IntentSignals;
  risk: PlanRiskLevel;
  inspected: readonly InspectedFileEvidence[];
  hasModelInferenceEvidence: boolean;
  evidence: Readonly<Record<string, EvidenceRef>>;
}): { steps: PlanStep[]; suggestedNextInspections: string[] } {
  const inspectedPaths = new Set(args.inspected.map((f) => f.path));
  const allHints = args.signals.fileHints.filter((p) => !inspectedPaths.has(p));

  const stepsRaw: Array<{
    title: string;
    summary: string;
    requiredInputs: string[];
    suggestedTools: string[];
    relatedFiles: string[];
    evidenceRefs: string[];
    blockedReason?: string;
    userConfirmationRequired: boolean;
    status: PlanStep["status"];
  }> = [];

  // Step 1: gather evidence
  if (args.inspected.length === 0) {
    stepsRaw.push({
      title: "Inspect at least one relevant file",
      summary:
        "Peh has not inspected any file yet. Pick the most likely entry point and approve a read-only inspection.",
      requiredInputs: ["A specific file path to inspect."],
      suggestedTools: ["inspect_one_file_safely"],
      relatedFiles: allHints,
      evidenceRefs: [],
      userConfirmationRequired: true,
      status: "needs-approval",
    });
  } else {
    stepsRaw.push({
      title: "Review what Peh already knows",
      summary: `Peh has packed contents of ${args.inspected.length} inspected file(s) to reason from.`,
      requiredInputs: [],
      suggestedTools: [],
      relatedFiles: [],
      evidenceRefs: Object.entries(args.evidence)
        .filter(([, ev]) => ev.type === "file")
        .map(([id]) => id),
      userConfirmationRequired: false,
      status: "proposed",
    });
  }

  // Step 2: action-specific
  const verb = args.signals.actionVerb;
  if (verb === "explain" || verb === "investigate") {
    stepsRaw.push({
      title: "Summarize the inspected file(s)",
      summary:
        "Walk through the inspected content and explain it in plain English. No edits.",
      requiredInputs: [],
      suggestedTools: [],
      relatedFiles: [],
      evidenceRefs: [],
      userConfirmationRequired: false,
      status: args.inspected.length === 0 ? "needs-evidence" : "proposed",
    });
  } else if (verb === "fix" || verb === "add" || verb === "refactor") {
    stepsRaw.push({
      title: `Describe the change you would make`,
      summary:
        "Peh will describe the change as text. This build does NOT apply edits — the user reviews the description and edits manually.",
      requiredInputs: ["The user's confirmation that the described change is what they want."],
      suggestedTools: [],
      relatedFiles: allHints,
      evidenceRefs: [],
      userConfirmationRequired: true,
      status: args.inspected.length === 0 ? "needs-evidence" : "proposed",
    });
  } else if (verb === "remove") {
    stepsRaw.push({
      title: "Plan the removal (description only)",
      summary:
        "Peh will describe what to remove. It will not delete files itself. The user performs the removal.",
      requiredInputs: ["User confirmation of which exact files / blocks to remove."],
      suggestedTools: [],
      relatedFiles: allHints,
      evidenceRefs: [],
      userConfirmationRequired: true,
      status: "needs-approval",
      blockedReason: "Removal is destructive — described only, never executed.",
    });
  } else if (verb === "test" || verb === "audit") {
    stepsRaw.push({
      title: "Identify what to verify",
      summary:
        "Describe the checks the user can run locally. Peh will not run shell commands.",
      requiredInputs: [],
      suggestedTools: [],
      relatedFiles: allHints,
      evidenceRefs: [],
      userConfirmationRequired: false,
      status: "proposed",
    });
  } else if (verb === "deploy") {
    stepsRaw.push({
      title: "Outline deploy steps (description only)",
      summary:
        "Peh does not deploy. It will outline steps the user can perform themselves.",
      requiredInputs: ["Target environment from the user."],
      suggestedTools: [],
      relatedFiles: allHints,
      evidenceRefs: [],
      userConfirmationRequired: true,
      status: "needs-approval",
    });
  } else {
    stepsRaw.push({
      title: "Clarify the goal",
      summary:
        "Peh could not classify the intended action. Ask the user to rephrase or narrow the goal.",
      requiredInputs: ["A more specific user goal."],
      suggestedTools: [],
      relatedFiles: [],
      evidenceRefs: [],
      userConfirmationRequired: true,
      status: "needs-evidence",
    });
  }

  // Step 3: confirm before applying — only suggested for change actions.
  if (verb === "fix" || verb === "add" || verb === "refactor" || verb === "remove" || verb === "deploy") {
    stepsRaw.push({
      title: "Ask the user before applying anything",
      summary:
        "This build has no write tools. Even when the description is solid, the user applies the change themselves.",
      requiredInputs: [],
      suggestedTools: [],
      relatedFiles: [],
      evidenceRefs: [],
      userConfirmationRequired: true,
      status: "needs-approval",
    });
  }

  const steps: PlanStep[] = stepsRaw.map((s, i) => ({
    id: makeStepId(args.planId, i),
    title: s.title,
    summary: s.summary,
    status: s.status,
    requiredInputs: s.requiredInputs,
    suggestedTools: s.suggestedTools,
    relatedFiles: s.relatedFiles,
    evidenceRefs: s.evidenceRefs,
    userConfirmationRequired: s.userConfirmationRequired,
    ...(s.blockedReason ? { blockedReason: s.blockedReason } : {}),
  }));

  return { steps, suggestedNextInspections: allHints };
}

function estimateComplexity(
  signals: IntentSignals,
  inspectedCount: number,
): ExecutionPlan["estimatedComplexity"] {
  if (signals.blocked) return "trivial";
  if (signals.actionVerb === "deploy" || signals.actionVerb === "refactor") {
    return inspectedCount > 1 ? "large" : "medium";
  }
  if (signals.actionVerb === "explain" || signals.actionVerb === "investigate") {
    return inspectedCount > 0 ? "small" : "trivial";
  }
  if (signals.actionVerb === "fix" || signals.actionVerb === "add") {
    return inspectedCount > 1 ? "medium" : "small";
  }
  return "small";
}

/**
 * Build an execution plan from the available evidence. Pure.
 */
export function buildPlan(input: BuildPlanInput): ExecutionPlan {
  const now = input.now ?? Date.now;
  const inspected = input.inspectedFiles ?? [];
  const priorReceipts = input.priorReceipts ?? [];

  const signals = detectSignals(input.userGoal);
  const risk = classifyRisk(signals);
  if (risk === "blocked") {
    return buildBlockedPlan({ userGoal: input.userGoal, now });
  }

  const planId = makePlanId(now());

  // Build evidence map
  const evidence: Record<string, EvidenceRef> = {};
  let evidenceIndex = 0;
  for (const file of inspected) {
    const id = makeEvidenceId(planId, evidenceIndex++);
    evidence[id] = {
      type: "file",
      source: file.path,
      confidence: "high",
      summary: `Approved read-only inspection of ${file.path} (${file.size ?? file.packedContent.length} chars packed).`,
    };
  }
  for (const receipt of priorReceipts) {
    // Reference receipts only when they are reliability-relevant.
    if (
      receipt.action.startsWith("reliability.") ||
      receipt.action.startsWith("planning.")
    ) {
      const id = makeEvidenceId(planId, evidenceIndex++);
      evidence[id] = {
        type: "receipt",
        source: receipt.id,
        confidence: "medium",
        summary: `${receipt.action}: ${receipt.summary}`.slice(0, 200),
      };
    }
  }

  // Assumption evidence (always present, marked as assumed)
  const assumptionId = makeEvidenceId(planId, evidenceIndex++);
  evidence[assumptionId] = {
    type: "user_input",
    source: "user-prompt",
    confidence: "medium",
    summary: input.userGoal.slice(0, 200),
  };

  // Inference evidence — only added when we have at least one file. Without
  // any inspected file, the planner has no basis for inference.
  let hasModelInferenceEvidence = false;
  if (inspected.length > 0 && signals.actionVerb !== "unknown") {
    const inferenceId = makeEvidenceId(planId, evidenceIndex++);
    evidence[inferenceId] = {
      type: "model_inference",
      source: `intent:${signals.actionVerb}`,
      confidence: "low",
      summary: `Peh inferred the action verb '${signals.actionVerb}' from the user goal.`,
    };
    hasModelInferenceEvidence = true;
  }

  // Build steps
  const { steps, suggestedNextInspections } = buildSteps({
    planId,
    signals,
    risk,
    inspected,
    hasModelInferenceEvidence,
    evidence,
  });

  // Confidence
  let confidenceLevel: PlanConfidenceLevel = "high";
  const missing: string[] = [];
  const assumptions: string[] = [];

  if (inspected.length === 0) {
    confidenceLevel = downgrade(confidenceLevel);
    confidenceLevel = downgrade(confidenceLevel);
    missing.push("No file has been inspected yet — Peh is reasoning only from your message.");
  } else if (inspected.length === 1) {
    confidenceLevel = downgrade(confidenceLevel);
  }
  if (signals.actionVerb === "unknown") {
    confidenceLevel = downgrade(confidenceLevel);
    missing.push("Peh could not classify what kind of change you want.");
  }
  if (signals.fileHints.length > inspected.length) {
    missing.push(
      `The message mentions ${signals.fileHints.length} path(s) but only ${inspected.length} were inspected.`,
    );
  }
  if (signals.topics.length === 0) {
    confidenceLevel = downgrade(confidenceLevel);
    missing.push("No specific topic keywords were detected.");
  }

  assumptions.push("Peh assumes the goal applies to the local project only.");
  if (signals.actionVerb === "fix") {
    assumptions.push("Peh assumes the user wants a fix described, not applied.");
  }
  if (risk === "elevated") {
    assumptions.push("Peh treats elevated-risk requests as description-only.");
  }

  const confidence: PlanConfidence = {
    overall: confidenceLevel,
    reasoning: buildConfidenceReasoning({
      inspected,
      signals,
      confidenceLevel,
    }),
    missingInformation: missing,
    assumptions,
  };

  // Receipts
  const receipts: ActivityReceipt[] = [
    buildReceipt({
      action: "planning.started",
      status: "info",
      title: "Plan generation started",
      summary: `Planning for goal: ${input.userGoal.slice(0, 80)}…`,
      metadata: {
        risk,
        evidence_files: inspected.length,
        evidence_receipts: priorReceipts.length,
        confidence: confidenceLevel,
      },
      now,
    }),
  ];
  if (inspected.length > 0) {
    receipts.push(
      buildReceipt({
        action: "planning.evidence-linked",
        status: "info",
        title: "Plan evidence linked",
        summary: `Linked ${inspected.length} inspected file(s) as evidence.`,
        metadata: { count: inspected.length },
        now,
      }),
    );
  }
  if (confidenceLevel !== "high") {
    receipts.push(
      buildReceipt({
        action: "planning.confidence-lowered",
        status: "info",
        title: "Plan confidence lowered",
        summary: `Confidence set to '${confidenceLevel}' due to missing evidence.`,
        metadata: {
          confidence: confidenceLevel,
          missing_count: missing.length,
        },
        now,
      }),
    );
  }
  if (steps.some((s) => s.status === "needs-evidence" || s.status === "needs-approval")) {
    receipts.push(
      buildReceipt({
        action: "planning.decomposed",
        status: "info",
        title: "Plan decomposed into smaller steps",
        summary: "One or more steps require approval or more evidence.",
        metadata: { needs_approval: true },
        now,
      }),
    );
  }
  receipts.push(
    buildReceipt({
      action: "planning.completed",
      status: "succeeded",
      title: "Plan generation completed",
      summary: `Plan ${planId} produced with ${steps.length} step(s) and confidence ${confidenceLevel}.`,
      metadata: {
        plan_id: planId,
        step_count: steps.length,
        confidence: confidenceLevel,
        risk,
      },
      now,
    }),
  );

  return {
    id: planId,
    userGoal: input.userGoal,
    confidence,
    riskLevel: risk,
    requiresApproval: steps.some((s) => s.userConfirmationRequired),
    estimatedComplexity: estimateComplexity(signals, inspected.length),
    createdAt: now(),
    steps,
    evidence,
    limitations: buildLimitations(signals, inspected.length),
    suggestedNextInspections,
    receipts,
    cloudUsed: false,
    localOnly: true,
  };
}

function buildConfidenceReasoning(args: {
  inspected: readonly InspectedFileEvidence[];
  signals: IntentSignals;
  confidenceLevel: PlanConfidenceLevel;
}): string {
  if (args.confidenceLevel === "high") {
    return `Peh has inspected ${args.inspected.length} relevant file(s) and detected a clear action verb. High confidence.`;
  }
  if (args.confidenceLevel === "medium") {
    return `Peh has some evidence but is missing pieces. Medium confidence.`;
  }
  return `Peh has very little evidence to plan from. Low confidence — treat the plan as suggestions.`;
}

function buildLimitations(
  signals: IntentSignals,
  inspectedCount: number,
): string[] {
  const limits = [
    "Peh does not edit files in this build.",
    "Peh does not run shell commands.",
    "Peh does not call cloud models.",
    "Peh reads files only after explicit approval.",
  ];
  if (inspectedCount === 0) {
    limits.push("No file has been inspected — the plan is purely advisory.");
  }
  if (signals.actionVerb === "deploy") {
    limits.push("Deploy is described, never executed.");
  }
  return limits;
}
