/**
 * Mode-aware capability matrix v3.
 *
 * Extends the capability registry with per-mode status reporting.
 * Each capability gets local and cloud mode status, limitations,
 * and honest user-facing messages.
 */

export type ModeCapabilityStatus =
  | "READY"
  | "PARTIAL"
  | "BLOCKED"
  | "NOT_IMPLEMENTED"
  | "REQUIRES_PROVIDER"
  | "REQUIRES_CONSENT"
  | "REQUIRES_APPROVAL"
  | "DISABLED"
  | "UNKNOWN";

export interface ModeCapabilityEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly localModeStatus: ModeCapabilityStatus;
  readonly cloudModeStatus: ModeCapabilityStatus;
  readonly localImplementation?: string;
  readonly cloudImplementation?: string;
  readonly localLimitations: string;
  readonly cloudLimitations: string;
  readonly requiredTools: readonly string[];
  readonly requiredProviders: readonly string[];
  readonly riskLevel: "low" | "medium" | "high";
  readonly approvalRequired: boolean;
  readonly proofReferences: readonly string[];
  readonly localProofReferences: readonly string[];
  readonly cloudProofReferences: readonly string[];
  readonly userFacingLocalCanMessage: string;
  readonly userFacingLocalCannotMessage: string;
  readonly userFacingCloudCanMessage: string;
  readonly userFacingCloudCannotMessage: string;
}

export const MODE_CAPABILITY_MATRIX: readonly ModeCapabilityEntry[] = [
  {
    id: "chat.basic",
    name: "Basic Chat",
    description: "Conversational chat with an AI model.",
    category: "chat",
    localModeStatus: "READY",
    cloudModeStatus: "NOT_IMPLEMENTED",
    localImplementation: "src/lib/chat/handler.ts",
    cloudImplementation: undefined,
    localLimitations: "Quality depends on the local model. Small models may produce brief or shallow replies.",
    cloudLimitations: "No cloud chat adapter exists yet.",
    requiredTools: ["chat.local"],
    requiredProviders: ["ollama"],
    riskLevel: "low",
    approvalRequired: false,
    proofReferences: ["reports/local-model-gauntlet/"],
    localProofReferences: ["reports/local-model-gauntlet/"],
    cloudProofReferences: [],
    userFacingLocalCanMessage: "Chat with your local model. Private, on-device.",
    userFacingLocalCannotMessage: "Install a local model to enable chat.",
    userFacingCloudCanMessage: "Cloud chat will be available when a cloud provider is configured.",
    userFacingCloudCannotMessage: "Cloud chat is not implemented yet.",
  },
  {
    id: "chat.advanced-planning",
    name: "Advanced Planning",
    description: "Multi-step planning and reasoning with AI.",
    category: "chat",
    localModeStatus: "PARTIAL",
    cloudModeStatus: "NOT_IMPLEMENTED",
    localImplementation: "src/lib/chat/handler.ts",
    cloudImplementation: undefined,
    localLimitations: "Small local models produce shallow plans. Requires 7B+ params for reasonable quality.",
    cloudLimitations: "Cloud planning not implemented.",
    requiredTools: ["chat.local"],
    requiredProviders: ["ollama"],
    riskLevel: "low",
    approvalRequired: false,
    proofReferences: [],
    localProofReferences: [],
    cloudProofReferences: [],
    userFacingLocalCanMessage: "Plan with your local model. Quality depends on model size.",
    userFacingLocalCannotMessage: "Install a larger local model (7B+ params) for better planning.",
    userFacingCloudCanMessage: "Cloud planning will leverage larger models for higher quality.",
    userFacingCloudCannotMessage: "Cloud planning is not implemented yet.",
  },
  {
    id: "code.single-file",
    name: "Single-File Code Suggestion",
    description: "Get code suggestions for a single file.",
    category: "code",
    localModeStatus: "READY",
    cloudModeStatus: "NOT_IMPLEMENTED",
    localImplementation: "src/app/api/fabrica/suggest/route.ts",
    cloudImplementation: undefined,
    localLimitations: "Suggestions only, does not write files. Quality depends on local model.",
    cloudLimitations: "Cloud code suggestions not implemented.",
    requiredTools: ["code.suggest"],
    requiredProviders: ["ollama"],
    riskLevel: "low",
    approvalRequired: false,
    proofReferences: ["src/app/api/fabrica/suggest/route.test.ts"],
    localProofReferences: ["src/app/api/fabrica/suggest/route.test.ts"],
    cloudProofReferences: [],
    userFacingLocalCanMessage: "Get code suggestions from your local model.",
    userFacingLocalCannotMessage: "Install a code-capable local model to enable suggestions.",
    userFacingCloudCanMessage: "Cloud code suggestions will use stronger models.",
    userFacingCloudCannotMessage: "Cloud code suggestions are not implemented yet.",
  },
  {
    id: "code.multi-file",
    name: "Multi-File Build",
    description: "Autonomous multi-file code editing and builds.",
    category: "code",
    localModeStatus: "NOT_IMPLEMENTED",
    cloudModeStatus: "NOT_IMPLEMENTED",
    localImplementation: undefined,
    cloudImplementation: undefined,
    localLimitations: "Not available locally — requires tool use and file write capabilities.",
    cloudLimitations: "Planned for Cloud Mode with approval gates. Not implemented.",
    requiredTools: ["fs.read", "fs.write", "repo.inspect", "repo.edit"],
    requiredProviders: ["openai", "anthropic"],
    riskLevel: "high",
    approvalRequired: true,
    proofReferences: [],
    localProofReferences: [],
    cloudProofReferences: [],
    userFacingLocalCanMessage: "",
    userFacingLocalCannotMessage: "Multi-file editing requires Cloud Mode with tool permissions.",
    userFacingCloudCanMessage: "Multi-file editing will be available with explicit approval when implemented.",
    userFacingCloudCannotMessage: "Multi-file editing is not implemented yet.",
  },
  {
    id: "image.analysis",
    name: "Image Analysis",
    description: "Analyze images with a vision model.",
    category: "vision",
    localModeStatus: "PARTIAL",
    cloudModeStatus: "NOT_IMPLEMENTED",
    localImplementation: "src/app/api/oculus/analyze/route.ts",
    cloudImplementation: undefined,
    localLimitations: "Ollama vision models only. Quality depends on model. llama-cpp vision not supported.",
    cloudLimitations: "Cloud vision not implemented.",
    requiredTools: ["image.analyze"],
    requiredProviders: ["ollama"],
    riskLevel: "low",
    approvalRequired: false,
    proofReferences: ["src/app/api/oculus/analyze/route.test.ts"],
    localProofReferences: ["src/app/api/oculus/analyze/route.test.ts"],
    cloudProofReferences: [],
    userFacingLocalCanMessage: "Analyze images with your local vision model.",
    userFacingLocalCannotMessage: "Install an Ollama vision model to enable image analysis.",
    userFacingCloudCanMessage: "Cloud vision analysis will use more capable models.",
    userFacingCloudCannotMessage: "Cloud vision analysis is not implemented yet.",
  },
  {
    id: "notes.storage",
    name: "Note Storage",
    description: "Save and retrieve notes in browser-local storage.",
    category: "storage",
    localModeStatus: "READY",
    cloudModeStatus: "READY",
    localImplementation: "src/app/archivum/page.tsx",
    cloudImplementation: "src/app/archivum/page.tsx",
    localLimitations: "Browser-local only. No sync, no backup.",
    cloudLimitations: "Same as local. Cloud sync not implemented.",
    requiredTools: ["notes.storage"],
    requiredProviders: [],
    riskLevel: "low",
    approvalRequired: false,
    proofReferences: [],
    localProofReferences: [],
    cloudProofReferences: [],
    userFacingLocalCanMessage: "Save notes in your browser.",
    userFacingLocalCannotMessage: "",
    userFacingCloudCanMessage: "Save notes locally. Cloud sync planned.",
    userFacingCloudCannotMessage: "",
  },
  {
    id: "file.readwrite",
    name: "File Read/Write",
    description: "Read and write files on the local filesystem.",
    category: "tools",
    localModeStatus: "NOT_IMPLEMENTED",
    cloudModeStatus: "NOT_IMPLEMENTED",
    localImplementation: undefined,
    cloudImplementation: undefined,
    localLimitations: "Not implemented. No file access in this build.",
    cloudLimitations: "Planned for Cloud Mode with receipt-backed approval.",
    requiredTools: ["fs.read", "fs.write"],
    requiredProviders: [],
    riskLevel: "high",
    approvalRequired: true,
    proofReferences: [],
    localProofReferences: [],
    cloudProofReferences: [],
    userFacingLocalCanMessage: "",
    userFacingLocalCannotMessage: "File access is not available in Local Mode.",
    userFacingCloudCanMessage: "File access will be available in Cloud Mode with approval.",
    userFacingCloudCannotMessage: "File access tools are not implemented yet.",
  },
  {
    id: "shell.execution",
    name: "Shell Execution",
    description: "Execute shell commands on the host system.",
    category: "tools",
    localModeStatus: "NOT_IMPLEMENTED",
    cloudModeStatus: "NOT_IMPLEMENTED",
    localImplementation: undefined,
    cloudImplementation: undefined,
    localLimitations: "Not implemented. No shell access.",
    cloudLimitations: "Planned for Cloud Mode with explicit scoped approval.",
    requiredTools: ["shell"],
    requiredProviders: [],
    riskLevel: "high",
    approvalRequired: true,
    proofReferences: [],
    localProofReferences: [],
    cloudProofReferences: [],
    userFacingLocalCanMessage: "",
    userFacingLocalCannotMessage: "Shell execution is not available in any mode yet.",
    userFacingCloudCanMessage: "Shell execution will require explicit approval when implemented.",
    userFacingCloudCannotMessage: "Shell execution is not implemented yet.",
  },
  {
    id: "web.search",
    name: "Web Search",
    description: "Search the web for information.",
    category: "tools",
    localModeStatus: "NOT_IMPLEMENTED",
    cloudModeStatus: "NOT_IMPLEMENTED",
    localImplementation: undefined,
    cloudImplementation: undefined,
    localLimitations: "Not implemented.",
    cloudLimitations: "Planned for Cloud Mode. Requires search provider.",
    requiredTools: ["web.search"],
    requiredProviders: [],
    riskLevel: "medium",
    approvalRequired: false,
    proofReferences: [],
    localProofReferences: [],
    cloudProofReferences: [],
    userFacingLocalCanMessage: "",
    userFacingLocalCannotMessage: "Web search is not available in Local Mode.",
    userFacingCloudCanMessage: "Web search will be available when a search provider is configured.",
    userFacingCloudCannotMessage: "Web search is not implemented yet.",
  },
  {
    id: "agent.autonomous",
    name: "Autonomous Agent Workflows",
    description: "Multi-step autonomous task planning and execution.",
    category: "agent",
    localModeStatus: "NOT_IMPLEMENTED",
    cloudModeStatus: "NOT_IMPLEMENTED",
    localImplementation: undefined,
    cloudImplementation: undefined,
    localLimitations: "Requires cloud model and tool capabilities.",
    cloudLimitations: "Planned for Cloud Mode. Full autonomy requires approval for risky actions.",
    requiredTools: ["agent.workflow", "fs.read", "fs.write", "shell", "web.search"],
    requiredProviders: ["openai", "anthropic"],
    riskLevel: "high",
    approvalRequired: true,
    proofReferences: [],
    localProofReferences: [],
    cloudProofReferences: [],
    userFacingLocalCanMessage: "",
    userFacingLocalCannotMessage: "Autonomous agent workflows require Cloud Mode.",
    userFacingCloudCanMessage: "Autonomous workflows will be available with approval when implemented.",
    userFacingCloudCannotMessage: "Autonomous agent workflows are not implemented yet.",
  },
  {
    id: "receipts.ledger",
    name: "Receipt Ledger",
    description: "View and audit action receipts.",
    category: "audit",
    localModeStatus: "READY",
    cloudModeStatus: "READY",
    localImplementation: "src/app/tabularium/page.tsx",
    cloudImplementation: "src/app/tabularium/page.tsx",
    localLimitations: "Browser-local storage only.",
    cloudLimitations: "Same as local. Cloud receipt sync not implemented.",
    requiredTools: ["receipts.view"],
    requiredProviders: [],
    riskLevel: "low",
    approvalRequired: false,
    proofReferences: [],
    localProofReferences: [],
    cloudProofReferences: [],
    userFacingLocalCanMessage: "View your action receipts.",
    userFacingLocalCannotMessage: "",
    userFacingCloudCanMessage: "View receipts for all actions including cloud.",
    userFacingCloudCannotMessage: "",
  },
  {
    id: "system.diagnostics",
    name: "System Diagnostics",
    description: "Health checks, model listing, capability discovery.",
    category: "diagnostics",
    localModeStatus: "READY",
    cloudModeStatus: "PARTIAL",
    localImplementation: "src/app/nous/page.tsx",
    cloudImplementation: undefined,
    localLimitations: "Local server diagnostics only.",
    cloudLimitations: "Cloud provider status checks planned but not implemented.",
    requiredTools: ["diagnostics.health", "diagnostics.models", "capability.discover"],
    requiredProviders: [],
    riskLevel: "low",
    approvalRequired: false,
    proofReferences: [],
    localProofReferences: [],
    cloudProofReferences: [],
    userFacingLocalCanMessage: "Check your local server health and available models.",
    userFacingLocalCannotMessage: "",
    userFacingCloudCanMessage: "Diagnostics for both local and cloud providers.",
    userFacingCloudCannotMessage: "Cloud provider diagnostics are not fully implemented.",
  },
] as const;

export function getModeCapabilityById(id: string): ModeCapabilityEntry | undefined {
  return MODE_CAPABILITY_MATRIX.find((c) => c.id === id);
}

export function getModeCapabilitiesByStatus(
  mode: "local" | "cloud",
  status: ModeCapabilityStatus,
): ModeCapabilityEntry[] {
  if (mode === "local") {
    return MODE_CAPABILITY_MATRIX.filter((c) => c.localModeStatus === status);
  }
  return MODE_CAPABILITY_MATRIX.filter((c) => c.cloudModeStatus === status);
}

export function getModeCapabilitySummary(mode: "local" | "cloud"): Record<ModeCapabilityStatus, number> {
  const counts: Record<string, number> = {};
  for (const entry of MODE_CAPABILITY_MATRIX) {
    const status = mode === "local" ? entry.localModeStatus : entry.cloudModeStatus;
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts as Record<ModeCapabilityStatus, number>;
}
