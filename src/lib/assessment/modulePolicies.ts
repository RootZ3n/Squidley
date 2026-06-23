import type { AssessmentActionId, AssessmentModulePolicy } from "./types";

export const RATIO_MODULE_POLICIES: readonly AssessmentModulePolicy[] = [
  policy("chat", "chat.basic", "public-local", "active", "Chat can chat with a local model in public mode.", { minimumPlanningAbility: "basic" }),
  policy("chat", "chat.advanced-planning", "cloud-assisted", "prepared", "Advanced planning needs a stronger reasoning model and an explicit cloud-assisted unlock.", { minimumPlanningAbility: "multi-step" }),
  policy("workshop", "workshop.single-file-suggestion", "public-local", "active", "Workshop can suggest one file at a time in public mode.", { minimumCodingAbility: "basic" }),
  policy("workshop", "workshop.multi-file-build", "cloud-agent", "future", "Multi-file builds require Cloud Agent mode, workspace access, and approval.", { minimumCodingAbility: "agentic", minimumPlanningAbility: "agentic", requiresWorkspace: true, requiresTools: true, requiresApproval: true }),
  policy("vision", "vision.local-image-analysis", "public-local", "active", "Vision can analyze a chosen image when a local vision model is selected.", { minimumVisionAbility: "basic" }),
  policy("velum", "velum.deterministic-review", "public-local", "active", "Velum uses deterministic local checks and does not need a model."),
  policy("notebook", "notebook.local-storage", "public-local", "active", "Notebook stores entries in this browser and does not need a model."),
  policy("notebook", "notebook.summarize", "cloud-assisted", "prepared", "Summarizing large local knowledge will need stronger model support later.", { minimumPlanningAbility: "multi-step" }),
  policy("tabularium", "activity-log.local-receipts", "public-local", "active", "ActivityLog stores local receipts in this browser and does not need a model."),
  policy("insights", "insights.system-map", "public-local", "active", "Insights maps modules, providers, and Assessment capability decisions without calling a model."),
  policy("settings", "settings.local-control", "public-local", "active", "Settings manages browser-local state and does not need a model."),
  policy("modules", "modules.public-gallery", "public-local", "active", "Modules lists public Peh capabilities and does not need a model."),
  policy("legatus", "legatus.agent-workflow", "cloud-agent", "locked", "Legatus agent workflows require Cloud Agent mode, tools, workspace access, and approval.", { minimumPlanningAbility: "agentic", requiresWorkspace: true, requiresTools: true, requiresApproval: true }),
  policy("imperium", "settings.advanced-control", "lab-power", "locked", "ControlPanel advanced controls remain locked outside lab-power mode.", { requiresWorkspace: true, requiresTools: true, requiresApproval: true }),
  policy("probatio", "probatio.model-evaluation", "cloud-assisted", "locked", "Probatio needs cloud-assisted evaluation support before it is active.", { minimumPlanningAbility: "multi-step" }),
  policy("imaginanium", "imaginanium.cloud-image-generation", "cloud-assisted", "locked", "Imaginanium is prepared for future image generation but is locked in public mode."),
  policy("archelon", "archelon.local-memory", "public-local", "future", "Archelon is a future local-memory direction and is not wired yet."),
] as const;

export function getAssessmentModulePolicy(moduleId: string, actionId: AssessmentActionId): AssessmentModulePolicy | undefined {
  return RATIO_MODULE_POLICIES.find((policy) => policy.moduleId === moduleId && policy.actionId === actionId);
}

function policy(
  moduleId: string,
  actionId: AssessmentActionId,
  minimumUnlockLevel: AssessmentModulePolicy["minimumUnlockLevel"],
  currentStatus: AssessmentModulePolicy["currentStatus"],
  publicMessage: string,
  extras: Partial<Pick<AssessmentModulePolicy, "minimumCodingAbility" | "minimumVisionAbility" | "minimumPlanningAbility" | "requiresWorkspace" | "requiresTools" | "requiresApproval">> = {},
): AssessmentModulePolicy {
  return {
    moduleId,
    actionId,
    minimumUnlockLevel,
    requiresWorkspace: extras.requiresWorkspace ?? false,
    requiresTools: extras.requiresTools ?? false,
    requiresApproval: extras.requiresApproval ?? false,
    currentStatus,
    publicMessage,
    ...(extras.minimumCodingAbility ? { minimumCodingAbility: extras.minimumCodingAbility } : {}),
    ...(extras.minimumVisionAbility ? { minimumVisionAbility: extras.minimumVisionAbility } : {}),
    ...(extras.minimumPlanningAbility ? { minimumPlanningAbility: extras.minimumPlanningAbility } : {}),
  };
}
