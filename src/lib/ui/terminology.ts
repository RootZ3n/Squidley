/**
 * Beginner-friendly terminology mapping for Peh.
 *
 * Single source of truth: every Latin module name maps to a plain-English
 * primary label, a one-line beginner description, and (where relevant) a
 * tooltip that explains what the user is looking at without requiring
 * them to read docs first.
 *
 * The Latin name (e.g. "Velum") is preserved as a SUBTITLE so the
 * existing lore/personality stays accessible to users who want it, but a
 * beginner who has never used Peh sees a friendly noun first.
 *
 * Pure data. No I/O. Safe to import anywhere — UI, docs generators, tests.
 *
 * Standard phrases (used verbatim across the UI):
 *   - Cloud not available:  "Cloud Mode is not implemented yet."
 *   - Approval (inspect):   "Approve and read once" / "Decline"
 *   - Approval (tiny edit): "Approve this edit"     / "Decline"
 *   - After approval:       "Approved. Peh is reading the file
 *                            once and will not change it." OR
 *                           "Approved. Peh is applying the edit
 *                            and verifying it now."
 *   - After decline:        "Declined. The file was not read." OR
 *                           "Declined. No edit was applied."
 *   - Provenance footer:    "answered by local model only · no tool
 *                            used · no cloud used"
 *
 * See docs/UI_LANGUAGE_GUIDE.md for the full canonical phrasing.
 */

export interface ModuleTerminology {
  /** Plain-English primary label, beginner-readable. */
  readonly friendlyLabel: string;
  /** Latin/internal name preserved for personality and continuity. */
  readonly latinName: string;
  /** One-line beginner description — fits in a tooltip. */
  readonly beginnerDescription: string;
  /** Slightly longer plain-English explanation for hover/expanded states. */
  readonly tooltip: string;
  /** Optional status suffix appended in the UI (e.g. "(locked)"). */
  readonly statusSuffix?: string;
}

export const MODULE_TERMINOLOGY = {
  chat: {
    friendlyLabel: "Chat",
    latinName: "",
    beginnerDescription: "Talk to a local AI model on your machine.",
    tooltip:
      "Chat with a local model. Replies show where they came from. Nothing leaves your computer.",
  },
  workshop: {
    friendlyLabel: "Code Helper",
    latinName: "",
    beginnerDescription: "Paste a single file; get a code suggestion.",
    tooltip:
      "Paste one file's text. Peh uses your local model to propose changes. The file is never written — you copy the suggestion yourself.",
  },
  notebook: {
    friendlyLabel: "Notes",
    latinName: "",
    beginnerDescription: "Save snippets and notes in this browser only.",
    tooltip:
      "Notes you save are stored only in this browser. Nothing is uploaded or synced.",
  },
  moreInput: {
    friendlyLabel: "More Input",
    latinName: "",
    beginnerDescription: "Quickly capture text to use later.",
    tooltip:
      "A focused capture view for adding notes you might want to use in chat. Stored in your browser only.",
  },
  velum: {
    friendlyLabel: "Safety Check",
    latinName: "Velum",
    beginnerDescription: "Review text before sharing it with the model.",
    tooltip:
      "Runs pattern-based checks for secrets, suspicious instructions, and risky content. Helpful, but not a guarantee.",
  },
  vision: {
    friendlyLabel: "Image Review",
    latinName: "",
    beginnerDescription: "Analyse an image with a local vision model.",
    tooltip:
      "Pick an image; if your local model supports vision, Peh describes what it sees. Image stays on your machine.",
  },
  activityLog: {
    friendlyLabel: "Activity Log",
    latinName: "",
    beginnerDescription: "Review what Peh actually did, with receipts.",
    tooltip:
      "An audit trail of every action. Stored in your browser. Receipts never contain raw secrets.",
  },
  insights: {
    friendlyLabel: "System Map",
    latinName: "",
    beginnerDescription: "See what is configured and what is connected.",
    tooltip:
      "What models are available, what is local-only, what is locked. Read-only.",
  },
  modules: {
    friendlyLabel: "Modules",
    latinName: "",
    beginnerDescription: "All available parts of Peh.",
    tooltip:
      "Browse every Peh module — what is local-ready, what needs approval, and what is planned.",
  },
  settings: {
    friendlyLabel: "Settings",
    latinName: "",
    beginnerDescription: "Tours, storage, and local model preferences.",
    tooltip:
      "Configure your local model server, tour visibility, storage limits, and export options. Nothing here calls the cloud.",
  },
  archelon: {
    friendlyLabel: "Memory",
    latinName: "Archelon",
    beginnerDescription: "Long-term memory — planned, not built yet.",
    tooltip:
      "Persistent memory across sessions. Not implemented in this build.",
    statusSuffix: "(planned)",
  },
  legatus: {
    friendlyLabel: "Agent Workflows",
    latinName: "Legatus",
    beginnerDescription: "Multi-step agent flows — Cloud Mode only.",
    tooltip:
      "Multi-step agent workflows with approval checkpoints. Cloud Mode is not implemented yet.",
    statusSuffix: "(locked)",
  },
  probatio: {
    friendlyLabel: "Model Evaluator",
    latinName: "Probatio",
    beginnerDescription: "Evaluate cloud models — Cloud Mode only.",
    tooltip:
      "Compare and evaluate cloud models. Cloud Mode is not implemented yet.",
    statusSuffix: "(locked)",
  },
  advancedSettings: {
    friendlyLabel: "Advanced Control",
    latinName: "",
    beginnerDescription: "High-trust controls — Cloud Mode only.",
    tooltip:
      "High-trust agent controls. Cloud Mode is not implemented yet.",
    statusSuffix: "(locked)",
  },
  imaginanium: {
    friendlyLabel: "Image Generation",
    latinName: "Imaginanium",
    beginnerDescription: "Cloud image generation — Cloud Mode only.",
    tooltip:
      "Cloud image generation. Cloud Mode is not implemented yet.",
    statusSuffix: "(locked)",
  },
} as const satisfies Record<string, ModuleTerminology>;

export type ModuleKey = keyof typeof MODULE_TERMINOLOGY;

/**
 * Canonical capability-tier beginner descriptions.
 *
 * These are the single source for badge tooltips, capability-matrix
 * markdown summaries, and teacher-KB explanations. Keep them short
 * (one sentence each) and beginner-readable.
 */
export const CAPABILITY_TIER_DESCRIPTIONS = {
  LOCAL_READY: {
    label: "Ready",
    short: "Works locally. No approval needed.",
    long: "Implemented and validated. Runs on your machine. Beginner-safe.",
  },
  LOCAL_LIMITED: {
    label: "Approval needed",
    short: "Works locally with safety limits and your approval.",
    long: "Real local capability bounded by hard scope limits and explicit per-action approval. Examples: narrow file inspection, tiny verified edits.",
  },
  LOCAL_PARTIAL: {
    label: "Limited",
    short: "Works locally. Quality depends on your model.",
    long: "Implemented locally but quality, backend coverage, or model dependence limits delivery. Peh says so when the limitation matters.",
  },
  CLOUD_PLANNED: {
    label: "Planned (cloud)",
    short: "Designed for Cloud Mode. Not running yet.",
    long: "Architecture exists in the codebase but no adapter or API call path is wired. Cannot run, even if API keys are configured.",
  },
  NOT_IMPLEMENTED: {
    label: "Not built",
    short: "No code path. Would be new work.",
    long: "Nothing is built for this. The honesty corrector overrides any model claim that it happened.",
  },
  BLOCKED: {
    label: "Intentionally unavailable",
    short: "Refused by design for safety and trust.",
    long: "Contract-enforced refusal. The codebase actively prevents this with type-level or runtime guards.",
  },
} as const;

export type CapabilityTier = keyof typeof CAPABILITY_TIER_DESCRIPTIONS;

/**
 * Canonical trust-surface phrases. Use these verbatim across the UI.
 * Centralised here so a single edit propagates everywhere; tests pin
 * the contract.
 */
export const TRUST_PHRASES = {
  cloudNotImplemented: "Cloud Mode is not implemented yet.",
  buildIdentifier: "this public Peh build",
  provenanceFooterShort:
    "answered by local model only · no tool used · no cloud used",

  approveInspect: "Approve and read once",
  approveEdit: "Approve this edit",
  decline: "Decline",
  approvedInspect:
    "Approved. Peh is reading the file once and will not change it.",
  approvedEdit:
    "Approved. Peh is applying the edit and verifying it now.",
  declinedInspect: "Declined. The file was not read.",
  declinedEdit: "Declined. No edit was applied.",

  modelUncertain: "The local model may be uncertain here.",
  modelCannotVerify: "Peh could not verify the answer.",
  actionRequiresApproval: "This action requires your approval.",

  rollbackOnVerifyFail:
    "Peh applied the edit, verification failed, and the file was restored from backup.",
  rollbackSuccess: "The change was reversed. Your file is back to its previous state.",
} as const;

export type TrustPhraseKey = keyof typeof TRUST_PHRASES;

/**
 * Helper: render a nav-item label string that pairs friendly + Latin
 * names. Used by docs generators; the live Sidebar component renders
 * them as separate elements so they can be styled independently.
 */
export function navLabelWithSubtitle(key: ModuleKey): string {
  const term = MODULE_TERMINOLOGY[key];
  if (!term.latinName) return term.friendlyLabel;
  return `${term.friendlyLabel} (${term.latinName})`;
}

/**
 * Helper: look up the friendly label by Latin name (case-insensitive).
 * Returns the original input if no mapping exists, so callers can use
 * it as a safe fall-through.
 */
const LATIN_INDEX: ReadonlyMap<string, ModuleKey> = new Map(
  (Object.entries(MODULE_TERMINOLOGY) as Array<[ModuleKey, ModuleTerminology]>)
    .filter(([, term]) => term.latinName)
    .map(([key, term]) => [term.latinName.toLowerCase(), key]),
);

export function friendlyNameForLatin(latin: string): string {
  const key = LATIN_INDEX.get(latin.toLowerCase());
  if (!key) return latin;
  return MODULE_TERMINOLOGY[key].friendlyLabel;
}
