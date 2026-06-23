import type { ProviderId } from "@/lib/providers/registry";
import { decideAssessmentAction } from "./decisionEngine";
import type {
  AssessmentActionId,
  AssessmentDecision,
  AssessmentDecisionInput,
  AssessmentPromptGatewayRisk,
  AssessmentTaskRisk,
  AssessmentUnlockLevel,
} from "./types";

const PUBLIC_LOCAL_DEFAULTS = {
  providerId: "ollama" as ProviderId,
  unlockLevel: "public-local" as AssessmentUnlockLevel,
  promptGatewayRisk: "low" as AssessmentPromptGatewayRisk,
  workspacePermission: false,
  toolPermission: false,
  approvalPolicy: "none" as const,
};

export function chatBasicDecision(modelId?: string): AssessmentDecision {
  return publicDecision("chat", "chat.basic", modelId, "low");
}

export function chatAdvancedPlanningDecision(modelId?: string): AssessmentDecision {
  return publicDecision("chat", "chat.advanced-planning", modelId, "medium");
}

export function fabricaSingleFileSuggestionDecision(modelId?: string): AssessmentDecision {
  return publicDecision("workshop", "workshop.single-file-suggestion", modelId, "medium");
}

export function fabricaMultiFileBuildDecision(modelId?: string): AssessmentDecision {
  return publicDecision("workshop", "workshop.multi-file-build", modelId, "high");
}

export function oculusLocalImageAnalysisDecision(modelId?: string): AssessmentDecision {
  return publicDecision("vision", "vision.local-image-analysis", modelId, "medium");
}

export function archivumLocalStorageDecision(): AssessmentDecision {
  return publicDecision("notebook", "notebook.local-storage", undefined, "low");
}

export function archivumFutureSummarizeDecision(modelId?: string): AssessmentDecision {
  return publicDecision("notebook", "notebook.summarize", modelId, "medium");
}

export function velumDeterministicReviewDecision(): AssessmentDecision {
  return publicDecision("velum", "velum.deterministic-review", undefined, "low");
}

export function tabulariumLocalReceiptsDecision(): AssessmentDecision {
  return publicDecision("tabularium", "activity-log.local-receipts", undefined, "low");
}

export function legatusAgentWorkflowDecision(modelId?: string): AssessmentDecision {
  return publicDecision("legatus", "legatus.agent-workflow", modelId, "high");
}

export function imperiumAdvancedControlDecision(modelId?: string): AssessmentDecision {
  return publicDecision("imperium", "settings.advanced-control", modelId, "critical");
}

export function ratioDecisionForPublicModule(moduleId: string, modelId?: string): AssessmentDecision {
  switch (moduleId) {
    case "chat":
      return chatBasicDecision(modelId);
    case "workshop":
      return fabricaSingleFileSuggestionDecision(modelId);
    case "notebook":
    case "more-input":
      return archivumLocalStorageDecision();
    case "velum":
      return velumDeterministicReviewDecision();
    case "vision":
      return oculusLocalImageAnalysisDecision(modelId);
    case "tabularium":
      return tabulariumLocalReceiptsDecision();
    case "insights":
      return publicDecision("insights", "insights.system-map", undefined, "low");
    case "settings":
      return publicDecision("settings", "settings.local-control", undefined, "low");
    case "modules":
      return publicDecision("modules", "modules.public-gallery", undefined, "low");
    case "legatus":
      return legatusAgentWorkflowDecision(modelId);
    case "imperium":
      return imperiumAdvancedControlDecision(modelId);
    case "probatio":
      return publicDecision("probatio", "probatio.model-evaluation", modelId, "medium");
    case "imaginanium":
      return publicDecision("imaginanium", "imaginanium.cloud-image-generation", modelId, "medium");
    case "archelon":
      return publicDecision("archelon", "archelon.local-memory", undefined, "low");
    default:
      return publicDecision("modules", "modules.public-gallery", undefined, "low");
  }
}

function publicDecision(
  moduleId: string,
  actionId: AssessmentActionId,
  modelId: string | undefined,
  taskRisk: AssessmentTaskRisk,
  overrides: Partial<AssessmentDecisionInput> = {},
): AssessmentDecision {
  return decideAssessmentAction({
    ...PUBLIC_LOCAL_DEFAULTS,
    moduleId,
    actionId,
    modelId,
    taskRisk,
    ...overrides,
  });
}
