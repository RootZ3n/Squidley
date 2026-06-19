/**
 * Project a plan into a beginner-friendly provenance report.
 *
 * The report carries only what the plan *actually* knows — never
 * fabricated detail. It is a pure function: same plan in, same report
 * out.
 *
 * Bucketing rules:
 *   - "known"     ← evidence of type "file" or "receipt" with
 *                    confidence >= "medium".
 *   - "inferred"  ← evidence of type "model_inference" (always
 *                    rendered as "inferred:" in UI).
 *   - "assumed"   ← evidence of type "user_input" (always rendered as
 *                    "assumed:" in UI).
 *   - "missing"   ← plan.confidence.missingInformation, verbatim.
 *
 * No percentages. The confidence is one of "high" | "medium" | "low".
 */

import type {
  ExecutionPlan,
  PlanProvenanceReport,
} from "./types";

export function buildProvenanceReport(plan: ExecutionPlan): PlanProvenanceReport {
  const known: string[] = [];
  const inferred: string[] = [];
  const assumed: string[] = [];

  for (const ev of Object.values(plan.evidence)) {
    if (ev.type === "file") {
      known.push(`${ev.source} — ${ev.summary}`);
    } else if (ev.type === "receipt" && ev.confidence !== "low") {
      known.push(`receipt ${ev.source}: ${ev.summary}`);
    } else if (ev.type === "model_inference") {
      inferred.push(ev.summary);
    } else if (ev.type === "user_input") {
      assumed.push(ev.summary);
    }
  }

  return {
    userGoal: plan.userGoal,
    confidence: plan.confidence.overall,
    confidenceReasoning: plan.confidence.reasoning,
    known,
    inferred,
    assumed,
    missing: plan.confidence.missingInformation,
    suggestedNextInspections: plan.suggestedNextInspections,
  };
}

/**
 * Render a plan + provenance as plain text. Used as the assistant reply
 * body so the UI without rich rendering still shows something honest.
 */
export function renderPlanAsText(plan: ExecutionPlan): string {
  const lines: string[] = [];
  lines.push(`Plan for: ${plan.userGoal}`);
  lines.push(`Risk: ${plan.riskLevel}   Confidence: ${plan.confidence.overall}`);
  lines.push(`Reason: ${plan.confidence.reasoning}`);
  lines.push("");
  lines.push("Steps:");
  for (const step of plan.steps) {
    const marker = step.userConfirmationRequired ? "[needs your OK]" : "[ok]";
    lines.push(`- ${step.title} ${marker}`);
    if (step.summary) lines.push(`    ${step.summary}`);
    if (step.blockedReason) lines.push(`    blocked: ${step.blockedReason}`);
  }

  const provenance = buildProvenanceReport(plan);
  if (provenance.known.length) {
    lines.push("", "Known (from inspected files / receipts):");
    for (const k of provenance.known) lines.push(`- ${k}`);
  }
  if (provenance.inferred.length) {
    lines.push("", "Inferred:");
    for (const k of provenance.inferred) lines.push(`- ${k}`);
  }
  if (provenance.assumed.length) {
    lines.push("", "Assumed:");
    for (const k of provenance.assumed) lines.push(`- ${k}`);
  }
  if (provenance.missing.length) {
    lines.push("", "Missing:");
    for (const k of provenance.missing) lines.push(`- ${k}`);
  }
  if (plan.suggestedNextInspections.length) {
    lines.push("", "Peh suggests inspecting next (with your approval):");
    for (const p of plan.suggestedNextInspections) lines.push(`- ${p}`);
  }
  if (plan.limitations.length) {
    lines.push("", "Limitations:");
    for (const l of plan.limitations) lines.push(`- ${l}`);
  }
  return lines.join("\n");
}
