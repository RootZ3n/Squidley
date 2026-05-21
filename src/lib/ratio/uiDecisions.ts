import type { ProviderId } from "@/lib/providers/registry";
import { decideRatioAction } from "./decisionEngine";
import type {
  RatioActionId,
  RatioDecision,
  RatioDecisionInput,
  RatioPromptGatewayRisk,
  RatioTaskRisk,
  RatioUnlockLevel,
} from "./types";

const PUBLIC_LOCAL_DEFAULTS = {
  providerId: "ollama" as ProviderId,
  unlockLevel: "public-local" as RatioUnlockLevel,
  promptGatewayRisk: "low" as RatioPromptGatewayRisk,
  workspacePermission: false,
  toolPermission: false,
  approvalPolicy: "none" as const,
};

export function colloquiumBasicChatDecision(modelId?: string): RatioDecision {
  return publicDecision("colloquium", "chat.basic", modelId, "low");
}

export function colloquiumAdvancedPlanningDecision(modelId?: string): RatioDecision {
  return publicDecision("colloquium", "chat.advanced-planning", modelId, "medium");
}

export function fabricaSingleFileSuggestionDecision(modelId?: string): RatioDecision {
  return publicDecision("fabrica", "fabrica.single-file-suggestion", modelId, "medium");
}

export function fabricaMultiFileBuildDecision(modelId?: string): RatioDecision {
  return publicDecision("fabrica", "fabrica.multi-file-build", modelId, "high");
}

export function oculusLocalImageAnalysisDecision(modelId?: string): RatioDecision {
  return publicDecision("oculus", "oculus.local-image-analysis", modelId, "medium");
}

export function archivumLocalStorageDecision(): RatioDecision {
  return publicDecision("archivum", "archivum.local-storage", undefined, "low");
}

export function archivumFutureSummarizeDecision(modelId?: string): RatioDecision {
  return publicDecision("archivum", "archivum.summarize", modelId, "medium");
}

export function velumDeterministicReviewDecision(): RatioDecision {
  return publicDecision("velum", "velum.deterministic-review", undefined, "low");
}

export function tabulariumLocalReceiptsDecision(): RatioDecision {
  return publicDecision("tabularium", "tabularium.local-receipts", undefined, "low");
}

export function legatusAgentWorkflowDecision(modelId?: string): RatioDecision {
  return publicDecision("legatus", "legatus.agent-workflow", modelId, "high");
}

export function imperiumAdvancedControlDecision(modelId?: string): RatioDecision {
  return publicDecision("imperium", "imperium.advanced-control", modelId, "critical");
}

export function ratioDecisionForPublicModule(moduleId: string, modelId?: string): RatioDecision {
  switch (moduleId) {
    case "colloquium":
      return colloquiumBasicChatDecision(modelId);
    case "fabrica":
      return fabricaSingleFileSuggestionDecision(modelId);
    case "archivum":
    case "more-input":
      return archivumLocalStorageDecision();
    case "velum":
      return velumDeterministicReviewDecision();
    case "oculus":
      return oculusLocalImageAnalysisDecision(modelId);
    case "tabularium":
      return tabulariumLocalReceiptsDecision();
    case "nous":
      return publicDecision("nous", "nous.system-map", undefined, "low");
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
  actionId: RatioActionId,
  modelId: string | undefined,
  taskRisk: RatioTaskRisk,
  overrides: Partial<RatioDecisionInput> = {},
): RatioDecision {
  return decideRatioAction({
    ...PUBLIC_LOCAL_DEFAULTS,
    moduleId,
    actionId,
    modelId,
    taskRisk,
    ...overrides,
  });
}
