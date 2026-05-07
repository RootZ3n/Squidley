/**
 * Tabularium receipt chain / grouping helpers.
 *
 * Pure helpers that group related Tabularium receipts into readable trust
 * chains. A chain tells a story: assessment -> policy -> offer -> consent.
 *
 * Hard constraints:
 *   - Pure functions only. No fetch. No provider calls. No cloud calls.
 *   - No localStorage reads or writes.
 *   - No mutation of source receipts.
 *   - cloudUsed is always false unless a future explicit cloud execution
 *     receipt exists (no such receipt type exists today).
 *   - Granted consent does NOT imply cloud execution.
 *   - No raw user/prompt/injected/document/code/image/secret content in
 *     any chain field.
 */

import type { TabulariumReceipt } from "./receipts";
import {
  receiptToTransparencyBadgeView,
  type CapabilityBadgeView,
} from "@/lib/capabilities/badges";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TabulariumReceiptChainKind =
  | "cloud-consent-flow"
  | "gateway-security-flow"
  | "capability-decision"
  | "standalone"
  | "unknown";

export type TabulariumReceiptStepKind =
  | "assessment"
  | "policy"
  | "offer"
  | "consent"
  | "capability"
  | "velum-prep"
  | "velum-review"
  | "other";

export interface TabulariumReceiptChainStep {
  receiptId: string;
  action: string;
  module: string;
  title: string;
  summary: string;
  createdAt: number;
  badgeView?: CapabilityBadgeView;
  stepKind: TabulariumReceiptStepKind;
}

export interface TabulariumReceiptChain {
  id: string;
  kind: TabulariumReceiptChainKind;
  title: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
  steps: readonly TabulariumReceiptChainStep[];
  riskLevel?: string;
  finalDecision?: string;
  nothingSentYet: boolean;
  cloudUsed: boolean;
}

export interface BuildReceiptChainsOptions {
  /** Maximum time window (ms) for grouping by capabilityId when no escalationPacketId is shared. Default 5000. */
  timestampWindowMs?: number;
}

// ---------------------------------------------------------------------------
// Forbidden content keys — never copy these into chain output
// ---------------------------------------------------------------------------

const FORBIDDEN_CONTENT_KEYS = new Set([
  "rawPrompt",
  "rawUserText",
  "rawInput",
  "injectedContent",
  "documentContent",
  "codeContent",
  "imageContent",
  "userMessage",
  "systemPrompt",
]);

// ---------------------------------------------------------------------------
// Step classification
// ---------------------------------------------------------------------------

export function classifyReceiptChainStep(
  receipt: Readonly<TabulariumReceipt>,
): TabulariumReceiptStepKind {
  const action = receipt.action;
  if (action === "security.prompt-injection.assessment") return "assessment";
  if (action === "security.gateway-policy.decision") return "policy";
  if (action === "cloud-escalation.offer") return "offer";
  if (action.startsWith("cloud-consent.")) return "consent";
  if (action === "capability.decision") return "capability";
  if (action === "velum-handoff.preparation") return "velum-prep";
  if (action === "velum-review.completed") return "velum-review";
  return "other";
}

// ---------------------------------------------------------------------------
// Grouping key extraction
// ---------------------------------------------------------------------------

export function getReceiptChainGroupKey(
  receipt: Readonly<TabulariumReceipt>,
): string | null {
  const meta = receipt.metadata;

  // Prefer escalationPacketId — all cloud-consent-flow receipts share this.
  if (meta && typeof meta.escalationPacketId === "string" && meta.escalationPacketId.length > 0) {
    return `epid:${meta.escalationPacketId}`;
  }

  // Fall back to capabilityId if present (used for timestamp-window grouping).
  if (meta && typeof meta.capabilityId === "string" && meta.capabilityId.length > 0) {
    return `capid:${meta.capabilityId}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Build a single step from a receipt
// ---------------------------------------------------------------------------

function receiptToStep(receipt: Readonly<TabulariumReceipt>): TabulariumReceiptChainStep {
  const stepKind = classifyReceiptChainStep(receipt);
  const badgeView = receiptToTransparencyBadgeView(receipt) ?? undefined;
  return {
    receiptId: receipt.id,
    action: receipt.action,
    module: receipt.module,
    title: receipt.title,
    summary: receipt.summary,
    createdAt: receipt.createdAt,
    badgeView,
    stepKind,
  };
}

// ---------------------------------------------------------------------------
// Chain kind classification
// ---------------------------------------------------------------------------

function classifyChainKind(stepKinds: ReadonlySet<TabulariumReceiptStepKind>): TabulariumReceiptChainKind {
  const hasAssessment = stepKinds.has("assessment");
  const hasPolicy = stepKinds.has("policy");
  const hasOffer = stepKinds.has("offer");
  const hasConsent = stepKinds.has("consent");
  const hasCapability = stepKinds.has("capability");
  const hasVelumPrep = stepKinds.has("velum-prep");
  const hasVelumReview = stepKinds.has("velum-review");
  const hasVelum = hasVelumPrep || hasVelumReview;

  // Full cloud consent flow: assessment + policy + offer + consent
  if (hasAssessment && hasPolicy && hasOffer && hasConsent) return "cloud-consent-flow";
  // Partial cloud flow: any of offer/consent present with security steps
  if (hasOffer || hasConsent) return "cloud-consent-flow";
  // Velum steps mixed with gateway/capability steps → cloud-consent-flow (pre-cloud safety)
  if (hasVelum && (hasAssessment || hasPolicy || hasCapability)) return "cloud-consent-flow";
  // Gateway security flow: assessment + policy without cloud receipts
  if (hasAssessment && hasPolicy) return "gateway-security-flow";
  // Capability decision only
  if (hasCapability && stepKinds.size === 1) return "capability-decision";
  if (hasCapability) return "capability-decision";
  // Assessment-only or policy-only
  if (hasAssessment || hasPolicy) return "gateway-security-flow";
  // Velum-only chains
  if (hasVelum) return "cloud-consent-flow";
  return "standalone";
}

// ---------------------------------------------------------------------------
// Chain title
// ---------------------------------------------------------------------------

const CHAIN_TITLES: Record<TabulariumReceiptChainKind, string> = {
  "cloud-consent-flow": "Cloud consent flow",
  "gateway-security-flow": "Gateway security flow",
  "capability-decision": "Capability decision",
  standalone: "Standalone receipt",
  unknown: "Unknown receipt",
};

// ---------------------------------------------------------------------------
// Risk level extraction
// ---------------------------------------------------------------------------

function extractRiskLevel(steps: readonly TabulariumReceiptChainStep[], receipts: readonly TabulariumReceipt[]): string | undefined {
  // Find the assessment step and pull riskLevel from the original receipt metadata
  for (const step of steps) {
    if (step.stepKind === "assessment") {
      const original = receipts.find((r) => r.id === step.receiptId);
      if (original?.metadata && typeof original.metadata.riskLevel === "string") {
        return original.metadata.riskLevel;
      }
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Final decision extraction
// ---------------------------------------------------------------------------

function extractFinalDecision(steps: readonly TabulariumReceiptChainStep[], receipts: readonly TabulariumReceipt[]): string | undefined {
  // Look for consent decision first, then policy allowed/blocked
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.stepKind === "consent") {
      const original = receipts.find((r) => r.id === step.receiptId);
      if (original?.metadata && typeof original.metadata.decision === "string") {
        return original.metadata.decision;
      }
      // Infer from action
      if (step.action === "cloud-consent.granted") return "granted";
      if (step.action === "cloud-consent.denied") return "denied";
      if (step.action === "cloud-consent.cancelled") return "cancelled";
      if (step.action === "cloud-consent.blocked") return "blocked";
    }
  }
  // Fall back to policy decision
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.stepKind === "policy") {
      const original = receipts.find((r) => r.id === step.receiptId);
      if (original?.metadata) {
        return original.metadata.allowed === true ? "allowed" : "blocked";
      }
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// nothingSentYet computation
// ---------------------------------------------------------------------------

function computeNothingSentYet(steps: readonly TabulariumReceiptChainStep[], receipts: readonly TabulariumReceipt[]): boolean {
  for (const step of steps) {
    if (step.stepKind === "offer" || step.stepKind === "consent" || step.stepKind === "velum-prep" || step.stepKind === "velum-review") {
      const original = receipts.find((r) => r.id === step.receiptId);
      if (original?.metadata && original.metadata.nothingSentYet === false) {
        return false;
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Chain summary
// ---------------------------------------------------------------------------

export function summarizeReceiptChain(chain: Readonly<TabulariumReceiptChain>): string {
  const { kind, riskLevel, finalDecision, nothingSentYet } = chain;
  const nothingSent = nothingSentYet ? " Nothing was sent." : "";
  const stepKinds = new Set(chain.steps.map((s) => s.stepKind));
  const hasVelumPrep = stepKinds.has("velum-prep");
  const hasVelumReview = stepKinds.has("velum-review");
  const hasVelum = hasVelumPrep || hasVelumReview;

  if (kind === "cloud-consent-flow") {
    // Velum-aware summaries when velum steps are present
    if (hasVelum) {
      if (finalDecision === "granted" && hasVelumReview) {
        return "Velum review completed and cloud consent was granted. Nothing was sent by these receipts.";
      }
      if (finalDecision === "granted") {
        return `Gateway and Velum checks ran before cloud consent. Consent was granted, but nothing was sent by these receipts.`;
      }
      if (finalDecision === "denied" || finalDecision === "cancelled" || finalDecision === "blocked") {
        return `Gateway and Velum checks ran before cloud consent. Consent was ${finalDecision}.${nothingSent}`;
      }
      if (hasVelumReview && !hasVelumPrep) {
        return `Velum review was marked complete locally. Consent may be offered next, but nothing was sent.`;
      }
      if (hasVelumReview) {
        return `Gateway and Velum checks ran before cloud consent. Consent may be recorded, but nothing was sent.`;
      }
      // Prep only
      return "Velum review was prepared locally. Nothing was sent.";
    }

    if (finalDecision === "granted") {
      return `Gateway allowed the cloud boundary, consent was granted, and nothing was sent by these receipts.`;
    }
    if (finalDecision === "denied") {
      return `Gateway processed the cloud boundary and consent was denied.${nothingSent}`;
    }
    if (finalDecision === "cancelled") {
      return `Gateway processed the cloud boundary and consent was cancelled.${nothingSent}`;
    }
    if (finalDecision === "blocked") {
      if (riskLevel === "high" || riskLevel === "critical") {
        return `Gateway blocked cloud escalation and recorded the blocked consent decision.${nothingSent}`;
      }
      return `Gateway blocked cloud escalation and recorded the blocked consent decision.${nothingSent}`;
    }
    return `Cloud consent flow recorded.${nothingSent}`;
  }

  if (kind === "gateway-security-flow") {
    if (riskLevel === "medium") {
      return `Gateway required Velum review before cloud escalation.${nothingSent}`;
    }
    if (riskLevel === "high" || riskLevel === "critical") {
      return `Gateway blocked this request due to prompt-injection risk.${nothingSent}`;
    }
    if (finalDecision === "allowed") {
      return `Gateway allowed this request to proceed.${nothingSent}`;
    }
    if (finalDecision === "blocked") {
      return `Gateway blocked this request.${nothingSent}`;
    }
    return `Gateway security assessment recorded.${nothingSent}`;
  }

  if (kind === "capability-decision") {
    return "Squidley evaluated this capability before acting.";
  }

  if (kind === "standalone") {
    return chain.steps.length === 1 ? chain.steps[0].summary : "Standalone receipt recorded.";
  }

  return "Receipt recorded.";
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildReceiptChains(
  receipts: readonly TabulariumReceipt[],
  options: BuildReceiptChainsOptions = {},
): TabulariumReceiptChain[] {
  const windowMs = options.timestampWindowMs ?? 5000;

  // Phase 1: group receipts by shared key
  const groups = new Map<string, TabulariumReceipt[]>();
  const ungrouped: TabulariumReceipt[] = [];

  for (const receipt of receipts) {
    const key = getReceiptChainGroupKey(receipt);
    if (key) {
      if (key.startsWith("epid:")) {
        // escalationPacketId — direct grouping
        const group = groups.get(key);
        if (group) {
          group.push(receipt);
        } else {
          groups.set(key, [receipt]);
        }
      } else if (key.startsWith("capid:")) {
        // capabilityId — group only within timestamp window
        let found = false;
        for (const [existingKey, group] of groups) {
          if (existingKey === key) {
            // Check timestamp window
            const earliest = Math.min(...group.map((r) => r.createdAt));
            const latest = Math.max(...group.map((r) => r.createdAt));
            if (
              Math.abs(receipt.createdAt - earliest) <= windowMs &&
              Math.abs(receipt.createdAt - latest) <= windowMs
            ) {
              group.push(receipt);
              found = true;
              break;
            }
          }
        }
        if (!found) {
          // Check if it should be standalone (e.g. capability.decision or unrelated)
          const stepKind = classifyReceiptChainStep(receipt);
          if (stepKind === "capability" || stepKind === "other") {
            ungrouped.push(receipt);
          } else {
            // Start a new group — security, offer, consent, velum-prep, velum-review
            groups.set(key, [receipt]);
          }
        }
      } else {
        ungrouped.push(receipt);
      }
    } else {
      ungrouped.push(receipt);
    }
  }

  const chains: TabulariumReceiptChain[] = [];

  // Phase 2: build chains from groups
  for (const [groupKey, group] of groups) {
    const sorted = [...group].sort((a, b) => a.createdAt - b.createdAt);
    const steps = sorted.map(receiptToStep);
    const stepKinds = new Set(steps.map((s) => s.stepKind));
    const kind = classifyChainKind(stepKinds);
    const riskLevel = extractRiskLevel(steps, receipts);
    const finalDecision = extractFinalDecision(steps, receipts);
    const nothingSentYet = computeNothingSentYet(steps, receipts);

    const chain: TabulariumReceiptChain = {
      id: `chain-${groupKey}`,
      kind,
      title: CHAIN_TITLES[kind],
      summary: "", // filled below
      createdAt: steps[0].createdAt,
      updatedAt: steps[steps.length - 1].createdAt,
      steps,
      ...(riskLevel !== undefined ? { riskLevel } : {}),
      ...(finalDecision !== undefined ? { finalDecision } : {}),
      nothingSentYet,
      cloudUsed: false,
    };
    chain.summary = summarizeReceiptChain(chain);
    chains.push(chain);
  }

  // Phase 3: standalone chains for ungrouped receipts
  for (const receipt of ungrouped) {
    const step = receiptToStep(receipt);
    const stepKinds = new Set<TabulariumReceiptStepKind>([step.stepKind]);
    const kind = classifyChainKind(stepKinds);
    const riskLevel = extractRiskLevel([step], [receipt]);
    const finalDecision = extractFinalDecision([step], [receipt]);
    const nothingSentYet = computeNothingSentYet([step], [receipt]);

    const chain: TabulariumReceiptChain = {
      id: `chain-${receipt.id}`,
      kind,
      title: CHAIN_TITLES[kind],
      summary: "",
      createdAt: step.createdAt,
      updatedAt: step.createdAt,
      steps: [step],
      ...(riskLevel !== undefined ? { riskLevel } : {}),
      ...(finalDecision !== undefined ? { finalDecision } : {}),
      nothingSentYet,
      cloudUsed: false,
    };
    chain.summary = summarizeReceiptChain(chain);
    chains.push(chain);
  }

  // Sort chains by createdAt ascending
  chains.sort((a, b) => a.createdAt - b.createdAt);

  return chains;
}

// ---------------------------------------------------------------------------
// Validation: ensure no forbidden content leaked into a chain
// ---------------------------------------------------------------------------

export function chainContainsForbiddenContentKeys(
  chain: Readonly<TabulariumReceiptChain>,
): boolean {
  const json = JSON.stringify(chain);
  for (const key of FORBIDDEN_CONTENT_KEYS) {
    if (json.includes(`"${key}"`)) return true;
  }
  return false;
}
