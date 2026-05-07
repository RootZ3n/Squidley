import type { ProviderId, ProviderType } from "@/lib/providers/registry";

export type RatioIntelligenceTier = "tiny" | "basic" | "standard" | "advanced" | "frontier";
export type RatioContextTier = "small" | "medium" | "large" | "huge";
export type RatioReliability = "none" | "weak" | "moderate" | "strong";
export type RatioCodingAbility = "none" | "basic" | "single-file" | "multi-file" | "agentic";
export type RatioVisionAbility = "none" | "basic" | "strong";
export type RatioPlanningAbility = "none" | "basic" | "multi-step" | "agentic";
export type RatioSafetyReliability = "unknown" | "basic" | "good" | "strong";
export type RatioAutonomyRecommendation = "explain-only" | "suggest" | "single-step" | "multi-step" | "agent";
export type RatioConfidence = "low" | "medium" | "high";

export type RatioUnlockLevel =
  | "public-local"
  | "local-plus"
  | "cloud-connected"
  | "cloud-assisted"
  | "cloud-agent"
  | "lab-power";

export type RatioTaskRisk = "low" | "medium" | "high" | "critical";
export type RatioPromptGatewayRisk = "low" | "medium" | "high" | "blocked";

export type RatioActionId =
  | "chat.basic"
  | "chat.advanced-planning"
  | "fabrica.single-file-suggestion"
  | "fabrica.multi-file-build"
  | "oculus.local-image-analysis"
  | "archivum.local-storage"
  | "archivum.summarize"
  | "velum.deterministic-review"
  | "tabularium.local-receipts"
  | "nous.system-map"
  | "settings.local-control"
  | "modules.public-gallery"
  | "legatus.agent-workflow"
  | "imperium.advanced-control"
  | "praertorium.policy-control"
  | "probatio.model-evaluation"
  | "imaginanium.cloud-image-generation"
  | "archelon.local-memory";

export type RatioDecisionStatus =
  | "available"
  | "limited"
  | "needs-stronger-model"
  | "needs-cloud-unlock"
  | "needs-tool-permission"
  | "needs-workspace"
  | "requires-approval"
  | "blocked"
  | "future";

export type RatioEffectiveMode =
  | "deterministic"
  | "local-chat"
  | "local-plus"
  | "cloud-assisted"
  | "cloud-agent"
  | "lab-power";

export type RatioCapabilityLevel = "explain" | "suggest" | "single-step" | "multi-step" | "agentic";

export interface RatioModelCapabilityProfile {
  providerId: ProviderId;
  modelIdPattern: string;
  providerType: ProviderType;
  intelligenceTier: RatioIntelligenceTier;
  contextTier: RatioContextTier;
  toolUseReliability: RatioReliability;
  codingAbility: RatioCodingAbility;
  visionAbility: RatioVisionAbility;
  planningAbility: RatioPlanningAbility;
  safetyReliability: RatioSafetyReliability;
  autonomyRecommendation: RatioAutonomyRecommendation;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsToolCalling: boolean;
  supportsJsonMode: boolean;
  supportsLongContext: boolean;
  confidence: RatioConfidence;
  modelSummary: string;
  notRecommendedFor: string[];
}

export interface RatioModulePolicy {
  moduleId: string;
  actionId: RatioActionId;
  minimumUnlockLevel: RatioUnlockLevel;
  minimumIntelligenceTier?: RatioIntelligenceTier;
  minimumCodingAbility?: RatioCodingAbility;
  minimumVisionAbility?: RatioVisionAbility;
  minimumPlanningAbility?: RatioPlanningAbility;
  requiresWorkspace: boolean;
  requiresTools: boolean;
  requiresApproval: boolean;
  currentStatus: "active" | "limited" | "prepared" | "locked" | "future";
  publicMessage: string;
}

export interface RatioDecisionInput {
  moduleId: string;
  actionId: RatioActionId;
  providerId: ProviderId;
  modelId?: string;
  unlockLevel: RatioUnlockLevel;
  taskRisk: RatioTaskRisk;
  promptGatewayRisk: RatioPromptGatewayRisk;
  workspacePermission: boolean;
  toolPermission: boolean;
  approvalPolicy: "none" | "ask" | "preapproved";
}

export interface RatioDecision {
  allowed: boolean;
  status: RatioDecisionStatus;
  effectiveMode: RatioEffectiveMode;
  capabilityLevel: RatioCapabilityLevel;
  reason: string;
  beginnerMessage: string;
  modelSummary: string;
  safetyNotes: string[];
  receiptSummary: string;
  requiredUnlockLevel?: RatioUnlockLevel;
  requiredCapabilities?: string[];
  localOnly: boolean;
  cloudUsed: false;
}
