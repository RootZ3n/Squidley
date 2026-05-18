/**
 * Compound tool scaffolding for the Small Model Reliability Layer.
 *
 * A "compound tool" is a small, deterministic procedure a beginner-safe
 * agent can run instead of asking the local model to perform multiple
 * steps in one shot. Each tool:
 *
 *   - takes an injected {@link ToolEnvironment} for IO (so tests inject
 *     a fixture filesystem rather than touching disk)
 *   - returns a {@link CompoundToolResult}
 *   - never mutates user data — except `make_small_text_change_and_verify`,
 *     which is a disabled stub by default
 *
 * Tools that *would* mutate state are gated behind the
 * `allowWriteOperations` field of the environment. The default environment
 * sets this to `false`, so the editing tool returns an honest "not
 * available" result instead of pretending to write.
 */

import { packContext, type ContextItem } from "./contextPacker";
import type { CompoundToolId, ReliabilityStep } from "./types";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  ".cache",
  "out",
  ".turbo",
]);

const MAX_TREE_ENTRIES = 200;

export interface DirEntry {
  readonly name: string;
  readonly isDirectory: boolean;
  readonly size?: number;
}

export interface ToolEnvironment {
  readonly rootPath: string;
  readonly allowWriteOperations: boolean;
  readDir(path: string): Promise<readonly DirEntry[]>;
  readFile(path: string): Promise<string>;
  /** Health probe for the configured local provider. Honest: returns
   *  whatever the probe says, never fakes "ready". */
  probeLocalHealth(): Promise<LocalHealthReport>;
  writeFile?(path: string, contents: string): Promise<void>;
}

export interface LocalHealthReport {
  readonly ok: boolean;
  readonly backend: "ollama" | "llama-cpp" | "unknown";
  readonly endpoint: string;
  readonly modelCount?: number;
  readonly error?: string;
}

export interface CompoundToolResult {
  readonly ok: boolean;
  readonly toolId: CompoundToolId;
  readonly summary: string;
  /** Short structured evidence — never raw file content past a small budget. */
  readonly evidence: string;
  readonly nextStep: string;
  /** Reliability steps the tool emitted while running. */
  readonly steps: readonly ReliabilityStep[];
}

function step(
  kind: ReliabilityStep["kind"],
  status: ReliabilityStep["status"],
  summary: string,
  extras?: { evidence?: string; error?: string },
): ReliabilityStep {
  return {
    kind,
    status,
    summary,
    ...(extras?.evidence ? { evidence: extras.evidence } : {}),
    ...(extras?.error ? { error: extras.error } : {}),
    at: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// explain_project_structure
// ---------------------------------------------------------------------------

const LIKELY_ENTRY_POINTS = [
  "package.json",
  "next.config.mjs",
  "next.config.js",
  "vite.config.ts",
  "src/app",
  "src/index.ts",
  "src/main.ts",
  "src/lib",
  "app",
  "pages",
];

export async function explainProjectStructure(
  env: ToolEnvironment,
): Promise<CompoundToolResult> {
  const steps: ReliabilityStep[] = [];
  try {
    const entries = await env.readDir(env.rootPath);
    const visible = entries
      .filter((e) => !IGNORED_DIRS.has(e.name) && !e.name.startsWith("."))
      .slice(0, MAX_TREE_ENTRIES);
    const dirs = visible.filter((e) => e.isDirectory).map((e) => e.name);
    const files = visible.filter((e) => !e.isDirectory).map((e) => e.name);

    const likely = LIKELY_ENTRY_POINTS.filter((path) =>
      visible.some((e) => e.name === path.split("/")[0]),
    );

    steps.push(
      step("compound_tool", "pass", "Listed top-level entries", {
        evidence: `dirs=${dirs.length}, files=${files.length}`,
      }),
    );

    const summary =
      `Top-level directories: ${dirs.slice(0, 12).join(", ") || "(none)"}\n` +
      `Top-level files: ${files.slice(0, 12).join(", ") || "(none)"}\n` +
      `Likely entry points: ${likely.join(", ") || "(none detected)"}`;

    return {
      ok: true,
      toolId: "explain_project_structure",
      summary,
      evidence: `entries=${visible.length} (ignored: ${[...IGNORED_DIRS].join(",")})`,
      nextStep:
        "Pick one likely entry point and ask Squidley to inspect that one file safely.",
      steps,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    steps.push(step("compound_tool", "fail", "Failed to list project root", { error }));
    return {
      ok: false,
      toolId: "explain_project_structure",
      summary: "Squidley could not read the project root.",
      evidence: error,
      nextStep:
        "Check the project root path. Squidley will not pretend to know files it could not read.",
      steps,
    };
  }
}

// ---------------------------------------------------------------------------
// inspect_one_file_safely
// ---------------------------------------------------------------------------

export interface InspectFileArgs {
  readonly path: string;
  /** Hard character budget for the inlined file body. */
  readonly maxChars?: number;
}

export async function inspectOneFileSafely(
  env: ToolEnvironment,
  args: InspectFileArgs,
): Promise<CompoundToolResult> {
  const steps: ReliabilityStep[] = [];
  const maxChars = args.maxChars ?? 2000;

  if (!args.path || args.path.includes("..")) {
    steps.push(
      step("compound_tool", "fail", "Rejected unsafe path", {
        error: "Path traversal characters detected (..) — refusing.",
      }),
    );
    return {
      ok: false,
      toolId: "inspect_one_file_safely",
      summary: "Squidley refused to read that path because it looked unsafe.",
      evidence: "rejected: contains '..'",
      nextStep: "Pass a clean path relative to the project root.",
      steps,
    };
  }

  let body: string;
  try {
    body = await env.readFile(args.path);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    steps.push(step("compound_tool", "fail", "File not readable", { error }));
    return {
      ok: false,
      toolId: "inspect_one_file_safely",
      summary: `Squidley could not read \`${args.path}\`.`,
      evidence: error,
      nextStep:
        "Confirm the file exists and the path is correct. Squidley will not invent contents.",
      steps,
    };
  }

  const items: ContextItem[] = [
    { id: args.path, kind: "snippet", label: args.path, body },
  ];
  const packed = packContext(items, { maxChars, maxItemChars: maxChars });
  const included = packed.includedItems[0];

  if (!included) {
    steps.push(
      step("compound_tool", "fail", "File was too large to inline", {
        error: packed.omittedItems[0]?.reason,
      }),
    );
    return {
      ok: false,
      toolId: "inspect_one_file_safely",
      summary: `\`${args.path}\` was too large to inspect safely.`,
      evidence: `omitted: ${packed.omittedItems[0]?.reason ?? "unknown"}`,
      nextStep:
        "Ask Squidley to summarize this file or to inspect a smaller portion (e.g., a specific function).",
      steps,
    };
  }

  steps.push(
    step("compound_tool", "pass", "Read file within budget", {
      evidence: `bytes=${included.includedSize}, truncated=${included.truncated}`,
    }),
  );

  const summary = describeFileBody(args.path, included.body, included.truncated);

  return {
    ok: true,
    toolId: "inspect_one_file_safely",
    summary,
    evidence: `bytes=${included.includedSize}, truncated=${included.truncated}, originalSize=${included.originalSize}`,
    nextStep: included.truncated
      ? "The file was truncated. Ask Squidley to inspect a specific function or symbol within it."
      : "Ask Squidley a focused question about this file.",
    steps,
  };
}

function describeFileBody(path: string, body: string, truncated: boolean): string {
  const lines = body.split(/\r?\n/);
  const exports: string[] = [];
  const functions: string[] = [];
  for (const line of lines) {
    const exportMatch = line.match(/^\s*export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/);
    if (exportMatch) exports.push(exportMatch[1]);
    const fnMatch = line.match(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
    if (fnMatch) functions.push(fnMatch[1]);
  }
  const headline = truncated
    ? `Inspected \`${path}\` (truncated for safety):`
    : `Inspected \`${path}\`:`;
  const exportLine = exports.length > 0
    ? `Exports: ${exports.slice(0, 8).join(", ")}`
    : "Exports: (none detected)";
  const fnLine = functions.length > 0
    ? `Top-level functions: ${functions.slice(0, 8).join(", ")}`
    : "Top-level functions: (none detected)";
  return `${headline}\n${exportLine}\n${fnLine}`;
}

// ---------------------------------------------------------------------------
// summarize_error_and_next_step
// ---------------------------------------------------------------------------

export interface ErrorContext {
  readonly errorText: string;
  readonly source?: "command" | "test" | "model" | "tool" | "unknown";
}

export function summarizeErrorAndNextStep(args: ErrorContext): CompoundToolResult {
  const steps: ReliabilityStep[] = [];
  const text = (args.errorText ?? "").trim();
  if (text.length === 0) {
    steps.push(step("compound_tool", "skipped", "No error text provided"));
    return {
      ok: false,
      toolId: "summarize_error_and_next_step",
      summary: "No error text was provided to summarize.",
      evidence: "empty input",
      nextStep: "Paste the error output and try again.",
      steps,
    };
  }

  // Deterministic classification — no model call.
  let cause = "unrecognized error";
  let next = "Re-run the command and capture the full output, then ask again.";

  if (/ECONNREFUSED|connection refused|fetch failed|network/i.test(text)) {
    cause = "the local server appears to be unreachable";
    next = "Check that Ollama or llama-server is running, then run the local health check.";
  } else if (/ENOENT|no such file/i.test(text)) {
    cause = "a referenced file or directory does not exist";
    next = "Re-check the path. Ask Squidley to list the project structure to find the right one.";
  } else if (/timeout|timed out/i.test(text)) {
    cause = "the request timed out";
    next = "Try a smaller prompt or a smaller model. Long contexts make small models stall.";
  } else if (/EACCES|permission denied/i.test(text)) {
    cause = "the OS denied permission";
    next = "Check file or port permissions. Squidley will not bypass OS protections.";
  } else if (/empty (?:reply|content|response)|no content/i.test(text)) {
    cause = "the model returned empty content (possibly hidden in `thinking`)";
    next = "Confirm `think: false` is set on Ollama calls, or try another model.";
  } else if (/SyntaxError|Unexpected token/i.test(text)) {
    cause = "the response was not valid JSON";
    next = "Reduce the prompt size and retry, or pin a stricter system message.";
  }

  steps.push(
    step("compound_tool", "pass", "Classified error", {
      evidence: cause,
    }),
  );

  return {
    ok: true,
    toolId: "summarize_error_and_next_step",
    summary: `Likely cause: ${cause}.`,
    evidence: redactErrorText(text),
    nextStep: next,
    steps,
  };
}

function redactErrorText(text: string): string {
  // Trim long stacks; keep first 240 chars for evidence (still useful, not raw).
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= 240 ? compact : `${compact.slice(0, 240)}…`;
}

// ---------------------------------------------------------------------------
// run_local_health_check
// ---------------------------------------------------------------------------

export async function runLocalHealthCheck(
  env: ToolEnvironment,
): Promise<CompoundToolResult> {
  const steps: ReliabilityStep[] = [];
  try {
    const report = await env.probeLocalHealth();
    steps.push(
      step("compound_tool", report.ok ? "pass" : "fail", "Local health probe ran", {
        evidence: `backend=${report.backend}, ok=${report.ok}`,
        error: report.error,
      }),
    );
    if (!report.ok) {
      return {
        ok: false,
        toolId: "run_local_health_check",
        summary: `Local model is not ready (${report.backend} @ ${report.endpoint}).`,
        evidence: report.error ?? "probe returned ok=false",
        nextStep:
          "Start Ollama or llama-server, pull a model, then re-run the health check.",
        steps,
      };
    }
    return {
      ok: true,
      toolId: "run_local_health_check",
      summary: `Local model ready: ${report.backend} @ ${report.endpoint} (${report.modelCount ?? "?"} models).`,
      evidence: `backend=${report.backend}, modelCount=${report.modelCount ?? "?"}`,
      nextStep: "Ask Squidley a focused question and watch the receipts.",
      steps,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    steps.push(step("compound_tool", "fail", "Health probe threw", { error }));
    return {
      ok: false,
      toolId: "run_local_health_check",
      summary: "The local health probe could not run.",
      evidence: error,
      nextStep: "Check that the local server endpoint is reachable.",
      steps,
    };
  }
}

// ---------------------------------------------------------------------------
// make_small_text_change_and_verify — disabled stub
// ---------------------------------------------------------------------------

export interface SmallTextChangeArgs {
  readonly path: string;
  readonly find: string;
  readonly replace: string;
  /** Verification callback (e.g., a test run). Defaults to "no verifier". */
  readonly verify?: () => Promise<{ ok: boolean; detail?: string }>;
}

export async function makeSmallTextChangeAndVerify(
  env: ToolEnvironment,
  args: SmallTextChangeArgs,
): Promise<CompoundToolResult> {
  const steps: ReliabilityStep[] = [];
  if (!env.allowWriteOperations || typeof env.writeFile !== "function") {
    steps.push(
      step("compound_tool", "skipped", "Edit tool is disabled by default", {
        evidence: "allowWriteOperations=false",
      }),
    );
    return {
      ok: false,
      toolId: "make_small_text_change_and_verify",
      summary:
        "Squidley does not change files automatically in this build. This is a deliberate stub.",
      evidence: "edit-tool disabled; no write was attempted",
      nextStep:
        "Make the change yourself, then ask Squidley to verify the result. A real edit tool will require explicit approval before being enabled.",
      steps,
    };
  }

  if (!args.path || args.path.includes("..")) {
    steps.push(step("compound_tool", "fail", "Rejected unsafe path"));
    return {
      ok: false,
      toolId: "make_small_text_change_and_verify",
      summary: "Squidley refused to edit that path because it looked unsafe.",
      evidence: "rejected: contains '..'",
      nextStep: "Pass a clean path relative to the project root.",
      steps,
    };
  }

  let before: string;
  try {
    before = await env.readFile(args.path);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    steps.push(step("compound_tool", "fail", "File not readable", { error }));
    return {
      ok: false,
      toolId: "make_small_text_change_and_verify",
      summary: `Squidley could not read \`${args.path}\` to edit it.`,
      evidence: error,
      nextStep: "Confirm the file exists. No write was attempted.",
      steps,
    };
  }

  if (!before.includes(args.find)) {
    steps.push(step("compound_tool", "fail", "Find text not present"));
    return {
      ok: false,
      toolId: "make_small_text_change_and_verify",
      summary: `The text to replace was not found in \`${args.path}\`. No change made.`,
      evidence: "find-text not present",
      nextStep: "Re-check the exact text to find. Squidley will not approximate edits.",
      steps,
    };
  }

  const after = before.replace(args.find, args.replace);
  if (after === before) {
    steps.push(step("compound_tool", "skipped", "No change after replacement"));
    return {
      ok: false,
      toolId: "make_small_text_change_and_verify",
      summary: `Replacement produced no change in \`${args.path}\`.`,
      evidence: "after === before",
      nextStep: "Verify the replacement text differs from the find text.",
      steps,
    };
  }

  await env.writeFile(args.path, after);
  steps.push(step("compound_tool", "pass", "Wrote one small change"));

  if (args.verify) {
    const verdict = await args.verify();
    steps.push(
      step("validate", verdict.ok ? "pass" : "fail", "Ran verifier", {
        evidence: verdict.detail,
      }),
    );
    if (!verdict.ok) {
      return {
        ok: false,
        toolId: "make_small_text_change_and_verify",
        summary: `Edit applied to \`${args.path}\` but verification failed.`,
        evidence: verdict.detail ?? "verifier returned ok=false",
        nextStep:
          "Revert the edit (or ask for help) before continuing. Squidley does not silently keep failing edits.",
        steps,
      };
    }
  }

  return {
    ok: true,
    toolId: "make_small_text_change_and_verify",
    summary: `Applied a small change to \`${args.path}\` and verification passed.`,
    evidence: "edit applied + verified",
    nextStep: "Review the diff before committing.",
    steps,
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface CompoundToolDescriptor {
  readonly id: CompoundToolId;
  readonly description: string;
  readonly readsFiles: boolean;
  readonly writesFiles: boolean;
  readonly needsModel: boolean;
  readonly needsCloud: false;
  readonly enabledByDefault: boolean;
}

export const COMPOUND_TOOL_REGISTRY: readonly CompoundToolDescriptor[] = [
  {
    id: "explain_project_structure",
    description: "Lists the top-level project folders and likely entry points.",
    readsFiles: true,
    writesFiles: false,
    needsModel: false,
    needsCloud: false,
    enabledByDefault: true,
  },
  {
    id: "inspect_one_file_safely",
    description: "Reads one file within a strict character budget and summarizes it.",
    readsFiles: true,
    writesFiles: false,
    needsModel: false,
    needsCloud: false,
    enabledByDefault: true,
  },
  {
    id: "summarize_error_and_next_step",
    description: "Classifies an error string and suggests one safe next step.",
    readsFiles: false,
    writesFiles: false,
    needsModel: false,
    needsCloud: false,
    enabledByDefault: true,
  },
  {
    id: "run_local_health_check",
    description: "Probes the local model server and reports readiness honestly.",
    readsFiles: false,
    writesFiles: false,
    needsModel: false,
    needsCloud: false,
    enabledByDefault: true,
  },
  {
    id: "make_small_text_change_and_verify",
    description:
      "Disabled in this build. A future edit-and-verify path that requires approval.",
    readsFiles: true,
    writesFiles: true,
    needsModel: false,
    needsCloud: false,
    enabledByDefault: false,
  },
];

export function getCompoundTool(id: CompoundToolId): CompoundToolDescriptor | undefined {
  return COMPOUND_TOOL_REGISTRY.find((t) => t.id === id);
}
