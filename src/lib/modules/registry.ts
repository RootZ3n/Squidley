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

export type ModuleCategory = "core-local" | "cloud-unlock";

export interface PublicModule {
  id: string;
  displayName: string;
  latinMeaning?: string;
  beginnerDescription: string;
  category: ModuleCategory;
  publicEnabled: boolean;
  localOnlySupported: boolean;
  cloudUnlockRequired: boolean;
  tourAvailable: boolean;
  route?: string;
  /**
   * Beginner-readable bullet list of constraints in public mode.
   * Intentionally short. Used for modules whose public scope is narrower
   * than their full capability — most notably Fabrica, which is single-file
   * and learning-oriented in public mode.
   */
  limitations?: readonly string[];
}

export const PUBLIC_MODULES: readonly PublicModule[] = [
  {
    id: "colloquium",
    displayName: "Colloquium",
    latinMeaning: "conversation, discussion",
    beginnerDescription:
      "Chat with Squidley. Ask questions, think out loud, and let Squidley walk you through the rest of the app.",
    category: "core-local",
    publicEnabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: true,
    route: "/colloquium",
  },
  {
    id: "fabrica",
    displayName: "Fabrica",
    latinMeaning: "workshop, forge",
    beginnerDescription:
      "A friendly workshop for learning to build. Fabrica helps with simple, single-file edits — a gentle introduction, not a full coding agent.",
    category: "core-local",
    publicEnabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: false,
    limitations: [
      "Single-file build and edit only",
      "Beginner-friendly introduction to building, not a full coding agent",
      "Does not run multi-file autonomous repo tasks",
      "Does not execute background shell commands on its own",
    ],
  },
  {
    id: "archivum",
    displayName: "Archivum",
    latinMeaning: "archive, records",
    beginnerDescription:
      "Your saved notes, conversations, and snippets. Stored locally; you decide what is kept.",
    category: "core-local",
    publicEnabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: false,
  },
  {
    id: "more-input",
    displayName: "More Input",
    beginnerDescription:
      "Bring extra context into a conversation — paste text, attach a file, or add reference snippets without leaving Colloquium.",
    category: "core-local",
    publicEnabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: false,
  },
  {
    id: "velum",
    displayName: "Velum",
    latinMeaning: "veil, curtain",
    beginnerDescription:
      "A privacy curtain. Mark items as hidden or redacted before they are shown, exported, or shared.",
    category: "core-local",
    publicEnabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: false,
  },
  {
    id: "archelon",
    displayName: "Archelon",
    beginnerDescription:
      "A long-memory companion. Archelon helps you keep durable context across sessions without leaving the device.",
    category: "core-local",
    publicEnabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: false,
  },
  {
    id: "oculus",
    displayName: "Oculus",
    latinMeaning: "eye",
    beginnerDescription:
      "Look at images, screenshots, and diagrams with Squidley. Upload a picture and ask what you are seeing.",
    category: "core-local",
    publicEnabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: false,
  },
  {
    id: "tabularium",
    displayName: "Tabularium",
    latinMeaning: "record office, ledger",
    beginnerDescription:
      "Tabular data and small spreadsheets. Read CSVs, summarize columns, and ask questions of structured data — locally.",
    category: "core-local",
    publicEnabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: false,
  },
  {
    id: "nous",
    displayName: "Nous",
    beginnerDescription:
      "A lightweight reasoning workspace for laying out ideas, plans, and outlines side-by-side with chat.",
    category: "core-local",
    publicEnabled: true,
    localOnlySupported: true,
    cloudUnlockRequired: false,
    tourAvailable: false,
  },

  // ---- Cloud Unlock — visible, gated, teach-only in public mode ----
  {
    id: "legatus",
    displayName: "Legatus",
    latinMeaning: "envoy, delegate",
    beginnerDescription:
      "An advanced helper that can run small tasks for you. Locked in public mode — shown so you know it exists.",
    category: "cloud-unlock",
    publicEnabled: true,
    localOnlySupported: false,
    cloudUnlockRequired: true,
    tourAvailable: false,
  },
  {
    id: "probatio",
    displayName: "Probatio",
    latinMeaning: "test, trial",
    beginnerDescription:
      "An advanced way to test and compare ideas or models. Locked in public mode — shown so you know it exists.",
    category: "cloud-unlock",
    publicEnabled: true,
    localOnlySupported: false,
    cloudUnlockRequired: true,
    tourAvailable: false,
  },
  {
    id: "imperium",
    displayName: "Imperium",
    latinMeaning: "command, authority",
    beginnerDescription:
      "Advanced coordination for several helpers working together. Locked in public mode — shown so you know it exists.",
    category: "cloud-unlock",
    publicEnabled: true,
    localOnlySupported: false,
    cloudUnlockRequired: true,
    tourAvailable: false,
  },
  {
    id: "praertorium",
    displayName: "Praertorium",
    latinMeaning: "headquarters",
    beginnerDescription:
      "An advanced overview of running tasks and schedules. Locked in public mode — shown so you know it exists.",
    category: "cloud-unlock",
    publicEnabled: true,
    localOnlySupported: false,
    cloudUnlockRequired: true,
    tourAvailable: false,
  },
  {
    id: "imaginanium",
    displayName: "Imaginanium",
    beginnerDescription:
      "An advanced workspace for generating and exploring images. Locked in public mode — local-only does not ship with image generation.",
    category: "cloud-unlock",
    publicEnabled: true,
    localOnlySupported: false,
    cloudUnlockRequired: true,
    tourAvailable: false,
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
