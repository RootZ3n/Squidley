/**
 * Peh module registry.
 *
 * Single source of truth for every module visible in public Peh.
 * UI components, the module gallery, and tour scaffolding all read from here.
 *
 * Conventions:
 *   - id            stable kebab-case identifier; URL-safe.
 *   - latinMeaning  short gloss of the Latin name (used in tour copy).
 *   - category      "core-local"  → must work with local-only mode.
 *                   "cloud-unlock" → advanced; visible but gated.
 */

import {
  NOTEBOOK_RECEIPT_ACTIONS,
  NOTEBOOK_STORAGE_KEY,
  MORE_INPUT_HANDOFF_KINDS,
  MORE_INPUT_RECEIPT_ACTIONS,
} from "@/lib/notebook/constants";
import {
  CHAT_HANDOFF_KINDS,
  CHAT_RECEIPT_ACTIONS,
  CHAT_SESSIONS_STORAGE_KEY,
  CHAT_STORAGE_KEY,
} from "@/lib/chat/moduleConstants";
import { WORKSHOP_RECEIPT_ACTIONS } from "@/lib/workshop/constants";
import {
  INSIGHTS_MODEL_PREFERENCES_KEY,
  INSIGHTS_RECEIPT_ACTIONS,
} from "@/lib/insights/constants";
import {
  VISION_RECEIPT_ACTIONS,
  VISION_TO_CHAT_HANDOFF_KIND,
} from "@/lib/vision/constants";
import {
  ACTIVITY_LOG_RECEIPT_ACTIONS,
  ACTIVITY_LOG_STORAGE_KEY,
} from "@/lib/activity-log/constants";
import {
  VELUM_HANDOFF_KINDS,
  VELUM_RECEIPT_ACTIONS,
} from "@/lib/velum/constants";
import type { ModuleCategory, PublicPehModuleDefinition } from "./contracts";

export type { ModuleCategory, PublicPehModuleDefinition } from "./contracts";
export type PublicModule = PublicPehModuleDefinition;

export const PUBLIC_MODULES: readonly PublicModule[] = [
  {
    id: "chat",
    displayName: "Chat",
    latinMeaning: "conversation, discussion",
    beginnerDescription:
      "Chat with Peh. Ask questions, think out loud, and let Peh walk you through the rest of the app.",
    category: "core-local",
    status: "active",
    publicEnabled: true,
    enabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: true,
    tourId: "chat",
    route: "/chat",
    assessmentActions: ["chat.basic", "chat.advanced-planning"],
    receiptActions: CHAT_RECEIPT_ACTIONS,
    storageKeys: [CHAT_SESSIONS_STORAGE_KEY, CHAT_STORAGE_KEY],
    handoffKinds: CHAT_HANDOFF_KINDS,
    providerRequirements: [{ providerId: "ollama", purpose: "local chat", active: true }],
    docs: { primary: "docs/LOCAL_CHAT.md" },
  },
  {
    id: "workshop",
    displayName: "Workshop",
    latinMeaning: "workshop, forge",
    beginnerDescription:
      "A beginner workshop for local single-file generation or edit suggestions. Multi-file build work is reserved for future Cloud Agent mode.",
    category: "core-local",
    status: "active",
    publicEnabled: true,
    enabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: true,
    tourId: "workshop",
    route: "/workshop",
    assessmentActions: ["workshop.single-file-suggestion", "workshop.multi-file-build"],
    receiptActions: WORKSHOP_RECEIPT_ACTIONS,
    providerRequirements: [{ providerId: "ollama", purpose: "local single-file suggestion", active: true }],
    docs: { primary: "docs/FABRICA_PUBLIC.md" },
    limitations: [
      "Single-file suggestions only",
      "Beginner-friendly workshop, not a full coding agent",
      "Does not run multi-file autonomous repo tasks",
      "Does not execute background shell commands on its own",
      "Does not write files automatically",
      "Multi-file builds require future Cloud Agent mode with explicit permissions",
    ],
  },
  {
    id: "notebook",
    displayName: "Notebook",
    latinMeaning: "archive, records",
    beginnerDescription:
      "Your local knowledge shelf for notes, snippets, and manual text imports. Stored in this browser; you decide what is kept.",
    category: "core-local",
    status: "active",
    publicEnabled: true,
    enabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: true,
    tourId: "notebook",
    route: "/notebook",
    assessmentActions: ["notebook.local-storage", "notebook.summarize"],
    receiptActions: NOTEBOOK_RECEIPT_ACTIONS,
    storageKeys: [NOTEBOOK_STORAGE_KEY],
    handoffKinds: MORE_INPUT_HANDOFF_KINDS,
    docs: { primary: "docs/ARCHIVUM_PUBLIC.md" },
  },
  {
    id: "more-input",
    displayName: "More Input",
    beginnerDescription:
      "Bring text into Peh by pasting it into Notebook's local More Input flow.",
    category: "core-local",
    status: "active",
    publicEnabled: true,
    enabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: true,
    tourId: "notebook",
    route: "/notebook",
    routeAliasOf: "notebook",
    assessmentActions: ["notebook.local-storage", "notebook.summarize"],
    receiptActions: MORE_INPUT_RECEIPT_ACTIONS,
    storageKeys: [NOTEBOOK_STORAGE_KEY],
    handoffKinds: MORE_INPUT_HANDOFF_KINDS,
    docs: { primary: "docs/ARCHIVUM_PUBLIC.md" },
  },
  {
    id: "velum",
    displayName: "Velum",
    latinMeaning: "veil, curtain",
    beginnerDescription:
      "A privacy curtain. Paste text for deterministic client-side safety review before you share it with AI, save it, or import it.",
    category: "core-local",
    status: "active",
    publicEnabled: true,
    enabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: true,
    tourId: "velum",
    route: "/velum",
    assessmentActions: ["velum.deterministic-review"],
    receiptActions: VELUM_RECEIPT_ACTIONS,
    handoffKinds: VELUM_HANDOFF_KINDS,
    docs: { primary: "docs/VELUM_PUBLIC.md" },
  },
  {
    id: "archelon",
    displayName: "Archelon",
    beginnerDescription:
      "A future local-memory companion. Shown as a public-local direction, but not wired as a route yet.",
    category: "core-local",
    status: "future",
    publicEnabled: true,
    enabled: false,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: false,
    assessmentActions: ["archelon.local-memory"],
    receiptActions: "none",
    docs: { note: "Future local-memory direction; no dedicated public doc yet." },
    limitations: [
      "No public route yet",
      "No background memory system or sync",
      "Does not upload or retrieve remote context",
    ],
  },
  {
    id: "vision",
    displayName: "Vision",
    latinMeaning: "eye",
    beginnerDescription:
      "Manually choose an image or screenshot for local-first visual review. Nothing is watched in the background and images are not stored by default.",
    category: "core-local",
    status: "active",
    publicEnabled: true,
    enabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: true,
    tourId: "vision",
    route: "/vision",
    assessmentActions: ["vision.local-image-analysis"],
    receiptActions: VISION_RECEIPT_ACTIONS,
    handoffKinds: [VISION_TO_CHAT_HANDOFF_KIND],
    providerRequirements: [{ providerId: "ollama", purpose: "local image analysis with vision model", active: true }],
    docs: { primary: "docs/OCULUS_PUBLIC.md" },
  },
  {
    id: "activity-log",
    displayName: "Activity Log",
    latinMeaning: "record office, ledger",
    beginnerDescription:
      "Peh's browser-local receipt room. See what happened, what stayed local, and what used a model.",
    category: "core-local",
    status: "active",
    publicEnabled: true,
    enabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: true,
    tourId: "activity-log",
    route: "/activity-log",
    assessmentActions: ["activity-log.local-receipts"],
    receiptActions: ACTIVITY_LOG_RECEIPT_ACTIONS,
    storageKeys: [ACTIVITY_LOG_STORAGE_KEY],
    docs: { primary: "docs/TABULARIUM_PUBLIC.md" },
  },
  {
    id: "insights",
    displayName: "Insights",
    beginnerDescription:
      "Peh's understanding map. See modules, Assessment adaptive intelligence, local model preferences, and cloud providers locked.",
    category: "core-local",
    status: "active",
    publicEnabled: true,
    enabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: true,
    tourId: "insights",
    route: "/insights",
    assessmentActions: ["insights.system-map"],
    receiptActions: INSIGHTS_RECEIPT_ACTIONS,
    storageKeys: [INSIGHTS_MODEL_PREFERENCES_KEY],
    docs: { primary: "docs/NOUS_PUBLIC.md" },
  },

  // ---- Cloud Unlock — visible, gated, teach-only in public mode ----
  {
    id: "legatus",
    displayName: "Legatus",
    latinMeaning: "envoy, delegate",
    beginnerDescription:
      "A future agent workflow helper. Locked in public mode until Cloud Agent mode, tools, workspace access, and approval exist.",
    category: "cloud-unlock",
    status: "locked",
    publicEnabled: true,
    enabled: false,
    localOnlySupported: false,
    cloudUnlockRequired: true,
    tourAvailable: false,
    assessmentActions: ["legatus.agent-workflow"],
    receiptActions: "none",
    docs: { note: "Cloud Unlock module; covered in docs/MODULE_MATRIX.md and docs/ADAPTIVE_SYSTEM_INTELLIGENCE.md." },
  },
  {
    id: "probatio",
    displayName: "Probatio",
    latinMeaning: "test, trial",
    beginnerDescription:
      "An advanced way to test and compare ideas or models. Locked in public mode — shown so you know it exists.",
    category: "cloud-unlock",
    status: "locked",
    publicEnabled: true,
    enabled: false,
    localOnlySupported: false,
    cloudUnlockRequired: true,
    tourAvailable: false,
    assessmentActions: ["probatio.model-evaluation"],
    receiptActions: "none",
    docs: { note: "Cloud Unlock module; covered in docs/MODULE_MATRIX.md and docs/ADAPTIVE_SYSTEM_INTELLIGENCE.md." },
  },
  {
    id: "imperium",
    displayName: "Advanced Settings",
    latinMeaning: "command, authority",
    beginnerDescription:
      "Advanced control and coordination. Locked in public mode and not active without future explicit high-trust permissions.",
    category: "cloud-unlock",
    status: "locked",
    publicEnabled: true,
    enabled: false,
    localOnlySupported: false,
    cloudUnlockRequired: true,
    tourAvailable: false,
    assessmentActions: ["settings.advanced-control"],
    receiptActions: "none",
    docs: { note: "Cloud Unlock module; covered in docs/MODULE_MATRIX.md and docs/ADAPTIVE_SYSTEM_INTELLIGENCE.md." },
  },
  {
    id: "imaginanium",
    displayName: "Imaginanium",
    beginnerDescription:
      "An advanced workspace for generating and exploring images. Locked in public mode — local-only does not ship with image generation.",
    category: "cloud-unlock",
    status: "locked",
    publicEnabled: true,
    enabled: false,
    localOnlySupported: false,
    cloudUnlockRequired: true,
    tourAvailable: false,
    assessmentActions: ["imaginanium.cloud-image-generation"],
    receiptActions: "none",
    docs: { note: "Cloud Unlock module; covered in docs/MODULE_MATRIX.md and docs/ADAPTIVE_SYSTEM_INTELLIGENCE.md." },
  },
] as const;

export function getModuleById(id: string): PublicModule | undefined {
  return PUBLIC_MODULES.find((m) => m.id === id);
}

export function getCoreLocalModules(): PublicModule[] {
  return PUBLIC_MODULES.filter((m) => m.category === "core-local");
}

export function getCloudUnlockModules(): PublicModule[] {
  return PUBLIC_MODULES.filter((m) => m.category === "cloud-unlock");
}
