/**
 * Public Squidley module registry.
 *
 * Single source of truth for every module visible in public Squidley.
 * UI components, the module gallery, and tour scaffolding all read from here.
 *
 * Conventions:
 *   - id            stable kebab-case identifier; URL-safe.
 *   - latinMeaning  short gloss of the Latin name (used in tour copy).
 *   - category      "core-local"  → must work with local-only mode.
 *                   "cloud-unlock" → advanced; visible but gated.
 */

import {
  ARCHIVUM_RECEIPT_ACTIONS,
  ARCHIVUM_STORAGE_KEY,
  MORE_INPUT_HANDOFF_KINDS,
  MORE_INPUT_RECEIPT_ACTIONS,
} from "@/lib/archivum/constants";
import {
  COLLOQUIUM_HANDOFF_KINDS,
  COLLOQUIUM_RECEIPT_ACTIONS,
  COLLOQUIUM_SESSIONS_STORAGE_KEY,
  COLLOQUIUM_STORAGE_KEY,
} from "@/lib/colloquium/constants";
import { FABRICA_RECEIPT_ACTIONS } from "@/lib/fabrica/constants";
import {
  NOUS_MODEL_PREFERENCES_KEY,
  NOUS_RECEIPT_ACTIONS,
} from "@/lib/nous/constants";
import {
  OCULUS_RECEIPT_ACTIONS,
  OCULUS_TO_COLLOQUIUM_HANDOFF_KIND,
} from "@/lib/oculus/constants";
import {
  TABULARIUM_RECEIPT_ACTIONS,
  TABULARIUM_STORAGE_KEY,
} from "@/lib/tabularium/constants";
import {
  VELUM_HANDOFF_KINDS,
  VELUM_RECEIPT_ACTIONS,
} from "@/lib/velum/constants";
import type { ModuleCategory, PublicSquidleyModuleDefinition } from "./contracts";

export type { ModuleCategory, PublicSquidleyModuleDefinition } from "./contracts";
export type PublicModule = PublicSquidleyModuleDefinition;

export const PUBLIC_MODULES: readonly PublicModule[] = [
  {
    id: "colloquium",
    displayName: "Colloquium",
    latinMeaning: "conversation, discussion",
    beginnerDescription:
      "Chat with Squidley. Ask questions, think out loud, and let Squidley walk you through the rest of the app.",
    category: "core-local",
    status: "active",
    publicEnabled: true,
    enabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: true,
    tourId: "colloquium",
    route: "/colloquium",
    ratioActions: ["chat.basic", "chat.advanced-planning"],
    receiptActions: COLLOQUIUM_RECEIPT_ACTIONS,
    storageKeys: [COLLOQUIUM_SESSIONS_STORAGE_KEY, COLLOQUIUM_STORAGE_KEY],
    handoffKinds: COLLOQUIUM_HANDOFF_KINDS,
    providerRequirements: [{ providerId: "ollama", purpose: "local chat", active: true }],
    docs: { primary: "docs/LOCAL_CHAT.md" },
  },
  {
    id: "fabrica",
    displayName: "Fabrica",
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
    tourId: "fabrica",
    route: "/fabrica",
    ratioActions: ["fabrica.single-file-suggestion", "fabrica.multi-file-build"],
    receiptActions: FABRICA_RECEIPT_ACTIONS,
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
    id: "archivum",
    displayName: "Archivum",
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
    tourId: "archivum",
    route: "/archivum",
    ratioActions: ["archivum.local-storage", "archivum.summarize"],
    receiptActions: ARCHIVUM_RECEIPT_ACTIONS,
    storageKeys: [ARCHIVUM_STORAGE_KEY],
    handoffKinds: MORE_INPUT_HANDOFF_KINDS,
    docs: { primary: "docs/ARCHIVUM_PUBLIC.md" },
  },
  {
    id: "more-input",
    displayName: "More Input",
    beginnerDescription:
      "Bring text into Squidley by pasting it into Archivum's local More Input flow.",
    category: "core-local",
    status: "active",
    publicEnabled: true,
    enabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: true,
    tourId: "archivum",
    route: "/archivum",
    routeAliasOf: "archivum",
    ratioActions: ["archivum.local-storage", "archivum.summarize"],
    receiptActions: MORE_INPUT_RECEIPT_ACTIONS,
    storageKeys: [ARCHIVUM_STORAGE_KEY],
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
    ratioActions: ["velum.deterministic-review"],
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
    ratioActions: ["archelon.local-memory"],
    receiptActions: "none",
    docs: { note: "Future local-memory direction; no dedicated public doc yet." },
    limitations: [
      "No public route yet",
      "No background memory system or sync",
      "Does not upload or retrieve remote context",
    ],
  },
  {
    id: "oculus",
    displayName: "Oculus",
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
    tourId: "oculus",
    route: "/oculus",
    ratioActions: ["oculus.local-image-analysis"],
    receiptActions: OCULUS_RECEIPT_ACTIONS,
    handoffKinds: [OCULUS_TO_COLLOQUIUM_HANDOFF_KIND],
    providerRequirements: [{ providerId: "ollama", purpose: "local image analysis with vision model", active: true }],
    docs: { primary: "docs/OCULUS_PUBLIC.md" },
  },
  {
    id: "tabularium",
    displayName: "Tabularium",
    latinMeaning: "record office, ledger",
    beginnerDescription:
      "Squidley's browser-local receipt room. See what happened, what stayed local, and what used a model.",
    category: "core-local",
    status: "active",
    publicEnabled: true,
    enabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: true,
    tourId: "tabularium",
    route: "/tabularium",
    ratioActions: ["tabularium.local-receipts"],
    receiptActions: TABULARIUM_RECEIPT_ACTIONS,
    storageKeys: [TABULARIUM_STORAGE_KEY],
    docs: { primary: "docs/TABULARIUM_PUBLIC.md" },
  },
  {
    id: "nous",
    displayName: "Nous",
    beginnerDescription:
      "Squidley's understanding map. See modules, Ratio adaptive intelligence, local model preferences, and cloud providers locked.",
    category: "core-local",
    status: "active",
    publicEnabled: true,
    enabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: true,
    tourId: "nous",
    route: "/nous",
    ratioActions: ["nous.system-map"],
    receiptActions: NOUS_RECEIPT_ACTIONS,
    storageKeys: [NOUS_MODEL_PREFERENCES_KEY],
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
    ratioActions: ["legatus.agent-workflow"],
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
    ratioActions: ["probatio.model-evaluation"],
    receiptActions: "none",
    docs: { note: "Cloud Unlock module; covered in docs/MODULE_MATRIX.md and docs/ADAPTIVE_SYSTEM_INTELLIGENCE.md." },
  },
  {
    id: "imperium",
    displayName: "Imperium",
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
    ratioActions: ["imperium.advanced-control"],
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
    ratioActions: ["imaginanium.cloud-image-generation"],
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
