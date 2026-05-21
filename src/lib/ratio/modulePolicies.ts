import type { RatioActionId, RatioModulePolicy } from "./types";

export const RATIO_MODULE_POLICIES: readonly RatioModulePolicy[] = [
  policy("colloquium", "chat.basic", "public-local", "active", "Colloquium can chat with a local model in public mode.", { minimumPlanningAbility: "basic" }),
  policy("colloquium", "chat.advanced-planning", "cloud-assisted", "prepared", "Advanced planning needs a stronger reasoning model and an explicit cloud-assisted unlock.", { minimumPlanningAbility: "multi-step" }),
  policy("fabrica", "fabrica.single-file-suggestion", "public-local", "active", "Fabrica can suggest one file at a time in public mode.", { minimumCodingAbility: "basic" }),
  policy("fabrica", "fabrica.multi-file-build", "cloud-agent", "future", "Multi-file builds require Cloud Agent mode, workspace access, and approval.", { minimumCodingAbility: "agentic", minimumPlanningAbility: "agentic", requiresWorkspace: true, requiresTools: true, requiresApproval: true }),
  policy("oculus", "oculus.local-image-analysis", "public-local", "active", "Oculus can analyze a chosen image when a local vision model is selected.", { minimumVisionAbility: "basic" }),
  policy("velum", "velum.deterministic-review", "public-local", "active", "Velum uses deterministic local checks and does not need a model."),
  policy("archivum", "archivum.local-storage", "public-local", "active", "Archivum stores entries in this browser and does not need a model."),
  policy("archivum", "archivum.summarize", "cloud-assisted", "prepared", "Summarizing large local knowledge will need stronger model support later.", { minimumPlanningAbility: "multi-step" }),
  policy("tabularium", "tabularium.local-receipts", "public-local", "active", "Tabularium stores local receipts in this browser and does not need a model."),
  policy("nous", "nous.system-map", "public-local", "active", "Nous maps modules, providers, and Ratio capability decisions without calling a model."),
  policy("settings", "settings.local-control", "public-local", "active", "Settings manages browser-local state and does not need a model."),
  policy("modules", "modules.public-gallery", "public-local", "active", "Modules lists public Squidley capabilities and does not need a model."),
  policy("legatus", "legatus.agent-workflow", "cloud-agent", "locked", "Legatus agent workflows require Cloud Agent mode, tools, workspace access, and approval.", { minimumPlanningAbility: "agentic", requiresWorkspace: true, requiresTools: true, requiresApproval: true }),
  policy("imperium", "imperium.advanced-control", "lab-power", "locked", "Imperium advanced controls remain locked outside lab-power mode.", { requiresWorkspace: true, requiresTools: true, requiresApproval: true }),
  policy("probatio", "probatio.model-evaluation", "cloud-assisted", "locked", "Probatio needs cloud-assisted evaluation support before it is active.", { minimumPlanningAbility: "multi-step" }),
  policy("imaginanium", "imaginanium.cloud-image-generation", "cloud-assisted", "locked", "Imaginanium is prepared for future image generation but is locked in public mode."),
  policy("archelon", "archelon.local-memory", "public-local", "future", "Archelon is a future local-memory direction and is not wired yet."),
] as const;

export function getRatioModulePolicy(moduleId: string, actionId: RatioActionId): RatioModulePolicy | undefined {
  return RATIO_MODULE_POLICIES.find((policy) => policy.moduleId === moduleId && policy.actionId === actionId);
}

function policy(
  moduleId: string,
  actionId: RatioActionId,
  minimumUnlockLevel: RatioModulePolicy["minimumUnlockLevel"],
  currentStatus: RatioModulePolicy["currentStatus"],
  publicMessage: string,
  extras: Partial<Pick<RatioModulePolicy, "minimumCodingAbility" | "minimumVisionAbility" | "minimumPlanningAbility" | "requiresWorkspace" | "requiresTools" | "requiresApproval">> = {},
): RatioModulePolicy {
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
