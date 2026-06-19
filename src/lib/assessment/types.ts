import type { ProviderId, ProviderType } from "@/lib/providers/registry";

export type AssessmentIntelligenceTier = "tiny" | "basic" | "standard" | "advanced" | "frontier";
export type AssessmentContextTier = "small" | "medium" | "large" | "huge";
export type AssessmentReliability = "none" | "weak" | "moderate" | "strong";
export type AssessmentCodingAbility = "none" | "basic" | "single-file" | "multi-file" | "agentic";
export type AssessmentVisionAbility = "none" | "basic" | "strong";
export type AssessmentPlanningAbility = "none" | "basic" | "multi-step" | "agentic";
export type AssessmentSafetyReliability = "unknown" | "basic" | "good" | "strong";
export type AssessmentAutonomyRecommendation = "explain-only" | "suggest" | "single-step" | "multi-step" | "agent";
export type AssessmentConfidence = "low" | "medium" | "high";

export type AssessmentUnlockLevel =
  | "public-local"
  | "local-plus"
  | "cloud-connected"
  | "cloud-assisted"
  | "cloud-agent"
  | "lab-power";

export type AssessmentTaskRisk = "low" | "medium" | "high" | "critical";
export type AssessmentPromptGatewayRisk = "low" | "medium" | "high" | "blocked";

export type AssessmentActionId =
  | "chat.basic"
  | "chat.advanced-planning"
  | "workshop.single-file-suggestion"
  | "workshop.multi-file-build"
  | "vision.local-image-analysis"
  | "notebook.local-storage"
  | "notebook.summarize"
  | "velum.deterministic-review"
  | "activity-log.local-receipts"
  | "insights.system-map"
  | "settings.local-control"
  | "modules.public-gallery"
  | "legatus.agent-workflow"
  | "settings.advanced-control"
  | "probatio.model-evaluation"
  | "imaginanium.cloud-image-generation"
  | "archelon.local-memory";

export type AssessmentDecisionStatus =
  | "available"
  | "limited"
  | "needs-stronger-model"
  | "needs-cloud-unlock"
  | "needs-tool-permission"
  | "needs-workspace"
  | "requires-approval"
  | "blocked"
  | "future";

export type AssessmentEffectiveMode =
  | "deterministic"
  | "local-chat"
  | "local-plus"
  | "cloud-assisted"
  | "cloud-agent"
  | "lab-power";

export type AssessmentCapabilityLevel = "explain" | "suggest" | "single-step" | "multi-step" | "agentic";

export interface AssessmentModelCapabilityProfile {
  providerId: ProviderId;
  modelIdPattern: string;
  providerType: ProviderType;
  intelligenceTier: AssessmentIntelligenceTier;
  contextTier: AssessmentContextTier;
  toolUseReliability: AssessmentReliability;
  codingAbility: AssessmentCodingAbility;
  visionAbility: AssessmentVisionAbility;
  planningAbility: AssessmentPlanningAbility;
  safetyReliability: AssessmentSafetyReliability;
  autonomyRecommendation: AssessmentAutonomyRecommendation;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsToolCalling: boolean;
  supportsJsonMode: boolean;
  supportsLongContext: boolean;
  confidence: AssessmentConfidence;
  modelSummary: string;
  notRecommendedFor: string[];
}

export interface AssessmentModulePolicy {
  moduleId: string;
  actionId: AssessmentActionId;
  minimumUnlockLevel: AssessmentUnlockLevel;
  minimumIntelligenceTier?: AssessmentIntelligenceTier;
  minimumCodingAbility?: AssessmentCodingAbility;
  minimumVisionAbility?: AssessmentVisionAbility;
  minimumPlanningAbility?: AssessmentPlanningAbility;
  requiresWorkspace: boolean;
  requiresTools: boolean;
  requiresApproval: boolean;
  currentStatus: "active" | "limited" | "prepared" | "locked" | "future";
  publicMessage: string;
}

export interface AssessmentDecisionInput {
  moduleId: string;
  actionId: AssessmentActionId;
  providerId: ProviderId;
  modelId?: string;
  unlockLevel: AssessmentUnlockLevel;
  taskRisk: AssessmentTaskRisk;
  promptGatewayRisk: AssessmentPromptGatewayRisk;
  workspacePermission: boolean;
  toolPermission: boolean;
  approvalPolicy: "none" | "ask" | "preapproved";
}

export interface AssessmentDecision {
  allowed: boolean;
  status: AssessmentDecisionStatus;
  effectiveMode: AssessmentEffectiveMode;
  capabilityLevel: AssessmentCapabilityLevel;
  reason: string;
  beginnerMessage: string;
  modelSummary: string;
  safetyNotes: string[];
  receiptSummary: string;
  requiredUnlockLevel?: AssessmentUnlockLevel;
  requiredCapabilities?: string[];
  localOnly: boolean;
  cloudUsed: false;
}
