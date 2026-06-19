/**
 * Mode-aware tool registry v2.
 *
 * Every tool-like action Peh may perform is registered here with
 * its availability in each mode. This is the source of truth for what
 * tools exist, which modes they work in, and their implementation status.
 */

export type ToolStatus =
  | "READY"
  | "PARTIAL"
  | "BLOCKED"
  | "NOT_IMPLEMENTED"
  | "REQUIRES_PROVIDER"
  | "REQUIRES_CONSENT"
  | "REQUIRES_APPROVAL"
  | "DISABLED"
  | "UNKNOWN";

export type ToolCategory =
  | "chat"
  | "file_read"
  | "file_write"
  | "shell"
  | "web_search"
  | "browser"
  | "repo_inspect"
  | "repo_edit"
  | "document_parse"
  | "image_vision"
  | "memory"
  | "diagnostics"
  | "receipts"
  | "agent_workflow";

export type ToolRiskLevel = "low" | "medium" | "high";

export interface ToolRegistryEntry {
  readonly toolId: string;
  readonly name: string;
  readonly description: string;
  readonly category: ToolCategory;
  readonly localStatus: ToolStatus;
  readonly cloudStatus: ToolStatus;
  readonly implementationFile?: string;
  readonly route?: string;
  readonly canReadFiles: boolean;
  readonly canWriteFiles: boolean;
  readonly canRunCommands: boolean;
  readonly canUseNetwork: boolean;
  readonly requiresCloudProvider: boolean;
  readonly requiresApproval: boolean;
  readonly riskLevel: ToolRiskLevel;
  readonly receiptRequired: boolean;
  readonly implemented: boolean;
  readonly enabledByDefaultLocal: boolean;
  readonly enabledByDefaultCloud: boolean;
  readonly proofReferences: readonly string[];
  readonly userFacingLocalMessage: string;
  readonly userFacingCloudMessage: string;
}

export const TOOL_REGISTRY: readonly ToolRegistryEntry[] = [
  // --- Chat (implemented locally) ---
  {
    toolId: "chat.local",
    name: "Local Chat",
    description: "Conversational chat with local model.",
    category: "chat",
    localStatus: "READY",
    cloudStatus: "NOT_IMPLEMENTED",
    implementationFile: "src/lib/chat/handler.ts",
    route: "/api/chat",
    canReadFiles: false,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "low",
    receiptRequired: true,
    implemented: true,
    enabledByDefaultLocal: true,
    enabledByDefaultCloud: true,
    proofReferences: ["reports/local-model-gauntlet/"],
    userFacingLocalMessage: "Chat with your local model. Nothing leaves this machine.",
    userFacingCloudMessage: "Local chat available. Cloud chat planned but not implemented.",
  },
  {
    toolId: "chat.cloud",
    name: "Cloud Chat",
    description: "Chat with a cloud-hosted model provider.",
    category: "chat",
    localStatus: "DISABLED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: false,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: true,
    requiresCloudProvider: true,
    requiresApproval: false,
    riskLevel: "low",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: true,
    proofReferences: [],
    userFacingLocalMessage: "Cloud chat is disabled in Local Mode.",
    userFacingCloudMessage: "Cloud chat is planned but no provider adapter exists yet.",
  },

  // --- File operations ---
  {
    toolId: "fs.read",
    name: "File Read",
    description: "Read files from the local filesystem.",
    category: "file_read",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: true,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "medium",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: true,
    proofReferences: [],
    userFacingLocalMessage: "File reading is not implemented in this build.",
    userFacingCloudMessage: "File reading is planned for Cloud Mode but not implemented yet.",
  },
  {
    toolId: "fs.write",
    name: "File Write",
    description: "Write or modify files on the local filesystem.",
    category: "file_write",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: false,
    canWriteFiles: true,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: true,
    riskLevel: "high",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: false,
    proofReferences: [],
    userFacingLocalMessage: "File writing is not implemented in this build.",
    userFacingCloudMessage: "File writing is planned for Cloud Mode. Requires approval when implemented.",
  },
  {
    toolId: "fs.delete",
    name: "File Delete",
    description: "Delete files from the local filesystem.",
    category: "file_write",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: false,
    canWriteFiles: true,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: true,
    riskLevel: "high",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: false,
    proofReferences: [],
    userFacingLocalMessage: "File deletion is not implemented in this build.",
    userFacingCloudMessage: "File deletion is planned for Cloud Mode. Requires explicit approval.",
  },

  // --- Shell ---
  {
    toolId: "shell",
    name: "Shell Command",
    description: "Execute shell commands on the host system.",
    category: "shell",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: true,
    canWriteFiles: true,
    canRunCommands: true,
    canUseNetwork: true,
    requiresCloudProvider: false,
    requiresApproval: true,
    riskLevel: "high",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: false,
    proofReferences: [],
    userFacingLocalMessage: "Shell execution is not implemented in this build.",
    userFacingCloudMessage: "Shell execution is planned for Cloud Mode. Requires explicit scoped approval.",
  },

  // --- Web ---
  {
    toolId: "web.search",
    name: "Web Search",
    description: "Search the web for information.",
    category: "web_search",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: false,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: true,
    requiresCloudProvider: true,
    requiresApproval: false,
    riskLevel: "medium",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: true,
    proofReferences: [],
    userFacingLocalMessage: "Web search is not implemented in this build.",
    userFacingCloudMessage: "Web search is planned for Cloud Mode but not implemented yet.",
  },
  {
    toolId: "web.browse",
    name: "Web Browse",
    description: "Fetch and parse web page content.",
    category: "browser",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: false,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: true,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "medium",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: true,
    proofReferences: [],
    userFacingLocalMessage: "Web browsing is not implemented in this build.",
    userFacingCloudMessage: "Web browsing is planned for Cloud Mode but not implemented yet.",
  },

  // --- Repo ---
  {
    toolId: "repo.inspect",
    name: "Repository Inspection",
    description: "Read and analyze project/repo files.",
    category: "repo_inspect",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: true,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "medium",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: true,
    proofReferences: [],
    userFacingLocalMessage: "Repository inspection is not implemented in this build.",
    userFacingCloudMessage: "Repository inspection is planned for Cloud Mode but not implemented yet.",
  },
  {
    toolId: "repo.edit",
    name: "Repository Edit",
    description: "Edit files in a project/repo.",
    category: "repo_edit",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: true,
    canWriteFiles: true,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: true,
    riskLevel: "high",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: false,
    proofReferences: [],
    userFacingLocalMessage: "Repository editing is not implemented in this build.",
    userFacingCloudMessage: "Repository editing is planned for Cloud Mode. Requires approval.",
  },

  // --- Document parsing ---
  {
    toolId: "document.parse",
    name: "Document Parse",
    description: "Parse and extract content from documents (PDF, etc).",
    category: "document_parse",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: true,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "medium",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: true,
    proofReferences: [],
    userFacingLocalMessage: "Document parsing is not implemented in this build.",
    userFacingCloudMessage: "Document parsing is planned for Cloud Mode but not implemented yet.",
  },

  // --- Vision ---
  {
    toolId: "image.analyze",
    name: "Image Analysis",
    description: "Analyze images with a vision model.",
    category: "image_vision",
    localStatus: "PARTIAL",
    cloudStatus: "NOT_IMPLEMENTED",
    implementationFile: "src/app/api/oculus/analyze/route.ts",
    route: "/api/oculus/analyze",
    canReadFiles: false,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "low",
    receiptRequired: true,
    implemented: true,
    enabledByDefaultLocal: true,
    enabledByDefaultCloud: true,
    proofReferences: ["src/app/api/oculus/analyze/route.test.ts"],
    userFacingLocalMessage: "Local image analysis via Ollama vision model. Quality depends on model.",
    userFacingCloudMessage: "Cloud vision analysis planned but not implemented yet.",
  },

  // --- Memory ---
  {
    toolId: "memory.write",
    name: "Memory Write",
    description: "Write to persistent memory store.",
    category: "memory",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: false,
    canWriteFiles: true,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "medium",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: true,
    proofReferences: [],
    userFacingLocalMessage: "Memory write is not implemented in this build.",
    userFacingCloudMessage: "Memory write is planned for Cloud Mode but not implemented yet.",
  },
  {
    toolId: "memory.read",
    name: "Memory Read",
    description: "Read from persistent memory store.",
    category: "memory",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: true,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "low",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: true,
    proofReferences: [],
    userFacingLocalMessage: "Memory read is not implemented in this build.",
    userFacingCloudMessage: "Memory read is planned for Cloud Mode but not implemented yet.",
  },

  // --- Diagnostics (implemented locally) ---
  {
    toolId: "diagnostics.health",
    name: "Health Check",
    description: "Check local model server health.",
    category: "diagnostics",
    localStatus: "READY",
    cloudStatus: "NOT_IMPLEMENTED",
    implementationFile: "src/app/api/local/health/route.ts",
    route: "/api/local/health",
    canReadFiles: false,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "low",
    receiptRequired: false,
    implemented: true,
    enabledByDefaultLocal: true,
    enabledByDefaultCloud: true,
    proofReferences: [],
    userFacingLocalMessage: "Health check for your local model server.",
    userFacingCloudMessage: "Cloud provider health checks planned but not implemented.",
  },
  {
    toolId: "diagnostics.models",
    name: "Model List",
    description: "List available models.",
    category: "diagnostics",
    localStatus: "READY",
    cloudStatus: "NOT_IMPLEMENTED",
    implementationFile: "src/app/api/local/models/route.ts",
    route: "/api/local/models",
    canReadFiles: false,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "low",
    receiptRequired: false,
    implemented: true,
    enabledByDefaultLocal: true,
    enabledByDefaultCloud: true,
    proofReferences: [],
    userFacingLocalMessage: "List models available on your local server.",
    userFacingCloudMessage: "Cloud model listing planned but not implemented.",
  },

  // --- Receipts (implemented locally) ---
  {
    toolId: "receipts.view",
    name: "Receipts View",
    description: "View action receipts from the ActivityLog ledger.",
    category: "receipts",
    localStatus: "READY",
    cloudStatus: "READY",
    implementationFile: "src/app/tabularium/page.tsx",
    canReadFiles: false,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "low",
    receiptRequired: false,
    implemented: true,
    enabledByDefaultLocal: true,
    enabledByDefaultCloud: true,
    proofReferences: [],
    userFacingLocalMessage: "View your action receipts from browser-local storage.",
    userFacingCloudMessage: "View action receipts including cloud actions.",
  },

  // --- Capability discovery (implemented locally) ---
  {
    toolId: "capability.discover",
    name: "Capability Discovery",
    description: "Explore available capabilities via the Insights system map.",
    category: "diagnostics",
    localStatus: "READY",
    cloudStatus: "READY",
    implementationFile: "src/app/nous/page.tsx",
    canReadFiles: false,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "low",
    receiptRequired: false,
    implemented: true,
    enabledByDefaultLocal: true,
    enabledByDefaultCloud: true,
    proofReferences: [],
    userFacingLocalMessage: "Explore what Peh can and cannot do.",
    userFacingCloudMessage: "Explore capabilities across Local and Cloud modes.",
  },

  // --- Notes storage (implemented locally) ---
  {
    toolId: "notes.storage",
    name: "Notes Storage",
    description: "Save and recall notes in browser-local storage.",
    category: "memory",
    localStatus: "READY",
    cloudStatus: "READY",
    implementationFile: "src/app/archivum/page.tsx",
    canReadFiles: false,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "low",
    receiptRequired: true,
    implemented: true,
    enabledByDefaultLocal: true,
    enabledByDefaultCloud: true,
    proofReferences: [],
    userFacingLocalMessage: "Save notes in your browser. Nothing leaves this device.",
    userFacingCloudMessage: "Save notes locally. Cloud sync not implemented.",
  },

  // --- Agent workflow ---
  {
    toolId: "agent.workflow",
    name: "Agent Workflow",
    description: "Multi-step autonomous agent workflows.",
    category: "agent_workflow",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: true,
    canWriteFiles: true,
    canRunCommands: true,
    canUseNetwork: true,
    requiresCloudProvider: true,
    requiresApproval: true,
    riskLevel: "high",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: false,
    proofReferences: [],
    userFacingLocalMessage: "Agent workflows are not implemented in this build.",
    userFacingCloudMessage: "Agent workflows are planned for Cloud Mode. Requires approval when implemented.",
  },

  // --- Code suggestion (existing local) ---
  {
    toolId: "code.suggest",
    name: "Code Suggestion",
    description: "Single-file code suggestion from local model.",
    category: "repo_inspect",
    localStatus: "READY",
    cloudStatus: "NOT_IMPLEMENTED",
    implementationFile: "src/app/api/fabrica/suggest/route.ts",
    route: "/api/fabrica/suggest",
    canReadFiles: false,
    canWriteFiles: false,
    canRunCommands: false,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: false,
    riskLevel: "low",
    receiptRequired: true,
    implemented: true,
    enabledByDefaultLocal: true,
    enabledByDefaultCloud: true,
    proofReferences: ["src/app/api/fabrica/suggest/route.test.ts"],
    userFacingLocalMessage: "Get code suggestions from your local model. Does not write files.",
    userFacingCloudMessage: "Cloud code suggestions planned but not implemented yet.",
  },

  // --- Git ---
  {
    toolId: "git.commit",
    name: "Git Commit",
    description: "Create git commits.",
    category: "repo_edit",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: true,
    canWriteFiles: true,
    canRunCommands: true,
    canUseNetwork: false,
    requiresCloudProvider: false,
    requiresApproval: true,
    riskLevel: "high",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: false,
    proofReferences: [],
    userFacingLocalMessage: "Git operations are not implemented in this build.",
    userFacingCloudMessage: "Git operations are planned for Cloud Mode. Requires explicit approval.",
  },

  // --- Package install ---
  {
    toolId: "package.install",
    name: "Package Install",
    description: "Install packages/dependencies.",
    category: "shell",
    localStatus: "NOT_IMPLEMENTED",
    cloudStatus: "NOT_IMPLEMENTED",
    canReadFiles: false,
    canWriteFiles: true,
    canRunCommands: true,
    canUseNetwork: true,
    requiresCloudProvider: false,
    requiresApproval: true,
    riskLevel: "high",
    receiptRequired: true,
    implemented: false,
    enabledByDefaultLocal: false,
    enabledByDefaultCloud: false,
    proofReferences: [],
    userFacingLocalMessage: "Package installation is not implemented in this build.",
    userFacingCloudMessage: "Package installation is planned for Cloud Mode. Requires explicit approval.",
  },
] as const;

export function getToolById(toolId: string): ToolRegistryEntry | undefined {
  return TOOL_REGISTRY.find((t) => t.toolId === toolId);
}

export function getToolsByCategory(category: ToolCategory): ToolRegistryEntry[] {
  return TOOL_REGISTRY.filter((t) => t.category === category);
}

export function getToolsForMode(mode: "local" | "cloud"): ToolRegistryEntry[] {
  if (mode === "local") {
    return TOOL_REGISTRY.filter((t) => t.localStatus === "READY" || t.localStatus === "PARTIAL");
  }
  return TOOL_REGISTRY.filter((t) => t.cloudStatus === "READY" || t.cloudStatus === "PARTIAL");
}

export function getImplementedTools(): ToolRegistryEntry[] {
  return TOOL_REGISTRY.filter((t) => t.implemented);
}

export function getHighRiskTools(): ToolRegistryEntry[] {
  return TOOL_REGISTRY.filter((t) => t.riskLevel === "high");
}

export function getApprovalRequiredTools(): ToolRegistryEntry[] {
  return TOOL_REGISTRY.filter((t) => t.requiresApproval);
}
