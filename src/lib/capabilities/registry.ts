/**
 * Peh capability registry.
 *
 * Static, auditable list of every per-action capability surfaced by a public
 * module. There is exactly one Capability per `(moduleId, ratioActionId)` pair
 * found in PUBLIC_MODULES. Tiers are hand-assigned per capability — they are
 * intentionally NOT derived from module fields, so a reviewer can audit each
 * row independently.
 *
 * Provider ID note:
 *   localRequirements use providerId "ollama" to mean "local model server".
 *   Ollama is validated end-to-end. llama.cpp text support uses the
 *   OpenAI-compatible local backend and still needs real llama-server binary
 *   validation. The actual backend is distinguished by
 *   LocalProviderConfig.backendType.
 *
 * The runtime decision engine is out of scope here. This file only declares
 * contracts and the data behind them.
 */

import { PUBLIC_MODULES, getModuleById } from "@/lib/modules/registry";
import type { Capability, CapabilityTier } from "./contracts";

export type {
  Capability,
  CapabilityHonestMessages,
  CapabilityRuntimeState,
  CapabilityTier,
  ProviderCapabilityProfile,
  ProviderRequirement,
} from "./contracts";

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "colloquium:chat.basic",
    moduleId: "colloquium",
    displayName: "Local chat",
    beginnerDescription:
      "Have a basic conversation with Peh using a local model. Stays on this machine.",
    tier: "local-core",
    localRequirements: [
      { providerId: "ollama", capabilityProfile: "chat" },
    ],
    cloudRequirements: [],
    honestMessages: {
      localReady: "Local chat is ready when an Ollama chat model is installed, or when an OpenAI-compatible local text backend is configured. Real llama-server binary validation is still pending.",
      localLimited: "If only a small chat model is installed, replies may be brief or shallow.",
    },
    receiptActions: ["colloquium.local-chat"],
    velumGated: true,
  },
  {
    id: "colloquium:chat.advanced-planning",
    moduleId: "colloquium",
    displayName: "Local advanced planning chat",
    beginnerDescription:
      "Ask Peh to think through a multi-step plan locally. Quality depends on the local model.",
    tier: "local-limited",
    localRequirements: [
      { providerId: "ollama", capabilityProfile: "chat", minParamsB: 7 },
    ],
    cloudRequirements: [],
    honestMessages: {
      localLimited:
        "Advanced planning runs locally but a small model may produce shallow plans. A larger local model improves results.",
      cloudOptional:
        "Cloud planning is not enabled in public mode. A future cloud unlock could improve plan quality.",
    },
    receiptActions: ["colloquium.local-chat"],
    velumGated: true,
  },
  {
    id: "fabrica:fabrica.single-file-suggestion",
    moduleId: "fabrica",
    displayName: "Local single-file suggestion",
    beginnerDescription:
      "Get a single-file edit or generation suggestion from a local model. Beginner workshop, not an autonomous coding agent.",
    tier: "local-core",
    localRequirements: [
      { providerId: "ollama", capabilityProfile: "code" },
    ],
    cloudRequirements: [],
    honestMessages: {
      localReady:
        "Single-file suggestions run when a local code-capable model is installed.",
      localLimited:
        "Tiny code models can produce shallow or incorrect suggestions. Always review before applying.",
    },
    receiptActions: ["fabrica.local-suggestion"],
    velumGated: true,
  },
  {
    id: "fabrica:fabrica.multi-file-build",
    moduleId: "fabrica",
    displayName: "Multi-file build",
    beginnerDescription:
      "Multi-file autonomous build work. Reserved for a future Cloud Agent mode with explicit permissions; not available locally.",
    tier: "cloud-required",
    localRequirements: [],
    cloudRequirements: [
      { providerId: "future-cloud-agent", capabilityProfile: "tool-use" },
    ],
    honestMessages: {
      cloudRequired:
        "Multi-file builds require a future Cloud Agent mode with workspace and tool permissions. Not available in public local-only mode.",
    },
    receiptActions: "none",
    velumGated: true,
  },
  {
    id: "archivum:archivum.local-storage",
    moduleId: "archivum",
    displayName: "Local note storage",
    beginnerDescription:
      "Save and recall notes, snippets, and pasted text in this browser only. No model is used.",
    tier: "local-core",
    localRequirements: [],
    cloudRequirements: [],
    honestMessages: {
      localReady:
        "Local storage runs entirely in this browser. No model is required and nothing is sent off-device.",
    },
    receiptActions: ["archivum.local-storage"],
    velumGated: false,
  },
  {
    id: "archivum:archivum.summarize",
    moduleId: "archivum",
    displayName: "Local note summary",
    beginnerDescription:
      "Ask a local model to summarize a stored note. Quality depends on the local chat model.",
    tier: "local-limited",
    localRequirements: [
      { providerId: "ollama", capabilityProfile: "chat" },
    ],
    cloudRequirements: [],
    honestMessages: {
      localLimited:
        "Summaries run locally; small models may miss nuance or shorten too aggressively.",
    },
    receiptActions: ["archivum.local-summary"],
    velumGated: true,
  },
  {
    id: "more-input:archivum.local-storage",
    moduleId: "more-input",
    displayName: "More Input — local capture",
    beginnerDescription:
      "Paste outside text into Archivum's local storage. Stays in this browser only.",
    tier: "local-core",
    localRequirements: [],
    cloudRequirements: [],
    honestMessages: {
      localReady:
        "More Input writes to Archivum's local storage in this browser. No model or upload is involved.",
    },
    receiptActions: ["archivum.local-storage"],
    velumGated: false,
  },
  {
    id: "more-input:archivum.summarize",
    moduleId: "more-input",
    displayName: "More Input — local summary",
    beginnerDescription:
      "Optionally summarize pasted text with a local model before storing.",
    tier: "local-limited",
    localRequirements: [
      { providerId: "ollama", capabilityProfile: "chat" },
    ],
    cloudRequirements: [],
    honestMessages: {
      localLimited:
        "Summaries of pasted text run on the local model. Small models may miss nuance.",
    },
    receiptActions: ["archivum.local-summary"],
    velumGated: true,
  },
  {
    id: "velum:velum.deterministic-review",
    moduleId: "velum",
    displayName: "Deterministic content review",
    beginnerDescription:
      "Run a client-side deterministic safety review on text before sharing it with a model or saving it.",
    tier: "local-core",
    localRequirements: [],
    cloudRequirements: [],
    honestMessages: {
      localReady:
        "Velum runs deterministic checks in this browser. No model is used and no text leaves the device.",
    },
    receiptActions: ["velum.deterministic-review"],
    velumGated: false,
  },
  {
    id: "archelon:archelon.local-memory",
    moduleId: "archelon",
    displayName: "Local memory companion",
    beginnerDescription:
      "A future local-memory companion. Not wired into any active route or storage yet.",
    tier: "blocked",
    localRequirements: [],
    cloudRequirements: [],
    honestMessages: {
      blocked:
        "Archelon is a future direction. There is no local memory system, no background sync, and no remote retrieval.",
    },
    receiptActions: "none",
    velumGated: false,
  },
  {
    id: "oculus:oculus.local-image-analysis",
    moduleId: "oculus",
    displayName: "Local image review",
    beginnerDescription:
      "Pick an image manually and ask a local vision model to describe or review it. Nothing is watched in the background.",
    tier: "local-limited",
    localRequirements: [
      { providerId: "ollama", capabilityProfile: "vision" },
    ],
    cloudRequirements: [],
    honestMessages: {
      localLimited:
        "Local vision quality depends on the installed vision model. Small models may miss details or describe images vaguely.",
    },
    receiptActions: ["oculus.local-image-analysis"],
    velumGated: true,
  },
  {
    id: "tabularium:tabularium.local-receipts",
    moduleId: "tabularium",
    displayName: "Local receipts ledger",
    beginnerDescription:
      "Browse what happened in Peh: which actions ran locally and which used a model, all from browser-local receipts.",
    tier: "local-core",
    localRequirements: [],
    cloudRequirements: [],
    honestMessages: {
      localReady:
        "Tabularium reads receipts from this browser only. No model and no upload are involved.",
    },
    receiptActions: ["tabularium.local-view"],
    velumGated: false,
  },
  {
    id: "nous:nous.system-map",
    moduleId: "nous",
    displayName: "System understanding map",
    beginnerDescription:
      "View Peh's modules, Ratio adaptive intelligence, and locked cloud providers. Read-only and local.",
    tier: "local-core",
    localRequirements: [],
    cloudRequirements: [],
    honestMessages: {
      localReady:
        "The Nous system map is computed from local registries. It does not call any model or cloud provider.",
    },
    receiptActions: ["nous.local-view"],
    velumGated: false,
  },
  {
    id: "legatus:legatus.agent-workflow",
    moduleId: "legatus",
    displayName: "Agent workflow",
    beginnerDescription:
      "A future agent workflow helper. Locked in public mode; would require Cloud Agent mode, tools, workspace access, and approval.",
    tier: "cloud-required",
    localRequirements: [],
    cloudRequirements: [
      { providerId: "future-cloud-agent", capabilityProfile: "tool-use" },
    ],
    honestMessages: {
      cloudRequired:
        "Agent workflows require a future Cloud Agent mode with explicit tool, workspace, and approval permissions. Locked in public mode.",
    },
    receiptActions: "none",
    velumGated: true,
  },
  {
    id: "probatio:probatio.model-evaluation",
    moduleId: "probatio",
    displayName: "Model evaluation",
    beginnerDescription:
      "Compare ideas or models in a structured way. Locked in public mode and shown only so you know it exists.",
    tier: "cloud-required",
    localRequirements: [],
    cloudRequirements: [
      { providerId: "future-cloud-evaluator", capabilityProfile: "chat" },
    ],
    honestMessages: {
      cloudRequired:
        "Model evaluation at this scale requires future cloud unlock. Locked in public mode.",
    },
    receiptActions: "none",
    velumGated: true,
  },
  {
    id: "imperium:imperium.advanced-control",
    moduleId: "imperium",
    displayName: "Advanced control",
    beginnerDescription:
      "Advanced control and coordination surface. Locked in public mode without future explicit high-trust permissions.",
    tier: "cloud-required",
    localRequirements: [],
    cloudRequirements: [
      { providerId: "future-cloud-control", capabilityProfile: "tool-use" },
    ],
    honestMessages: {
      cloudRequired:
        "Imperium controls require future cloud unlock plus explicit high-trust permissions. Locked in public mode.",
    },
    receiptActions: "none",
    velumGated: true,
  },
  {
    id: "imaginanium:imaginanium.cloud-image-generation",
    moduleId: "imaginanium",
    displayName: "Cloud image generation",
    beginnerDescription:
      "Generate and explore images. Locked in public mode — local-only Peh does not ship with image generation.",
    tier: "cloud-required",
    localRequirements: [],
    cloudRequirements: [
      { providerId: "future-cloud-imaging", capabilityProfile: "vision" },
    ],
    honestMessages: {
      cloudRequired:
        "Image generation requires a future cloud image provider. Local-only Peh does not ship with image generation.",
    },
    receiptActions: "none",
    velumGated: true,
  },
] as const;

export function getCapabilityById(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

export function getCapabilitiesForModule(moduleId: string): Capability[] {
  return CAPABILITIES.filter((c) => c.moduleId === moduleId);
}

export function getCapabilitiesByTier(tier: CapabilityTier): Capability[] {
  return CAPABILITIES.filter((c) => c.tier === tier);
}

/**
 * Audit-only helper: which (moduleId, ratioActionId) pairs in PUBLIC_MODULES
 * have no Capability registered yet. Returns an empty list when the registry
 * is in sync. Exported so the test can produce a precise error message.
 */
export function findUnregisteredRatioActions(): { moduleId: string; actionId: string }[] {
  const missing: { moduleId: string; actionId: string }[] = [];
  for (const m of PUBLIC_MODULES) {
    if (m.ratioActions === "none") continue;
    for (const action of m.ratioActions) {
      const hit = CAPABILITIES.find(
        (c) => c.moduleId === m.id && c.id === `${m.id}:${action}`,
      );
      if (!hit) missing.push({ moduleId: m.id, actionId: action });
    }
  }
  return missing;
}

/**
 * Audit-only helper: capabilities whose moduleId does not resolve to a
 * registered public module. Empty when registry is in sync.
 */
export function findOrphanCapabilityModuleIds(): string[] {
  return CAPABILITIES.filter((c) => !getModuleById(c.moduleId)).map((c) => c.id);
}
