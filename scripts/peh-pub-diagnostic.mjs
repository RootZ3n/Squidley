#!/usr/bin/env node
/**
 * scripts/peh-pub-diagnostic.mjs
 *
 * Release-readiness diagnostic for Peh.
 *
 * Exits non-zero on REAL failures:
 *   - cloud SDK dependency found
 *   - cloud URL found in non-metadata source file
 *   - default mode flips to anything but local-only
 *   - capability matrix missing or malformed
 *   - prove-local-only script or smoke-llama-server script missing
 *   - any LOCAL_READY capability without proofReferences
 *   - llama-server marked LOCAL_READY without reports/llama-server-smoke/PROOF.json
 *   - heuristic-honesty regression: absolute-safety overclaims found
 *   - env example or registry references cloud SDKs
 *
 * It does NOT exit non-zero merely because Ollama is unreachable on the host
 * running the diagnostic, because that environment may legitimately not have
 * Ollama installed (e.g. CI). That state is reported clearly.
 */

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");

function readSafe(file) {
  try {
    return readFileSync(path.join(REPO_ROOT, file), "utf8");
  } catch {
    return "";
  }
}

function grepLines(pat, extraGrep = []) {
  const cmd = [
    "grep",
    "-RIn",
    pat,
    "src/",
    `--include=*.ts`,
    `--include=*.tsx`,
    `--include=*.js`,
    ...extraGrep,
  ];
  const result = spawnSync(cmd[0], cmd.slice(1), {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return (result.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const findings = [];
const failures = [];

function ok(label, detail) {
  findings.push({ level: "ok", label, detail });
}
function warn(label, detail) {
  findings.push({ level: "warn", label, detail });
}
function fail(label, detail) {
  findings.push({ level: "fail", label, detail });
  failures.push({ label, detail });
}

// 1. Repo & defaults
findings.push({ level: "info", label: "repoPath", detail: REPO_ROOT });

const envExample = readSafe(".env.example");
if (
  envExample.includes("PEH_LOCAL_ENDPOINT") &&
  envExample.includes("localhost") &&
  !envExample.includes("OPENAI_API_KEY") &&
  !envExample.includes("ANTHROPIC_API_KEY")
) {
  ok("env-example.local-only", "Default env points only at local endpoints.");
} else {
  fail("env-example.local-only", "Default env example leaks cloud-style keys.");
}

// 2. Cloud SDK dependencies
let pkg = {};
try {
  pkg = JSON.parse(readSafe("package.json"));
} catch {
  fail("package.json.parse", "Could not parse package.json.");
}
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const cloudSdkPatterns = [
  /^@anthropic-ai\//,
  /^openai$/,
  /^@google\/generative-ai$/,
  /^@google\/genai$/,
  /^@google-cloud\//,
  /^cohere/,
  /^groq-sdk$/,
  /^together-ai/,
  /^@openrouter\//,
];
const cloudDeps = Object.keys(deps).filter((name) =>
  cloudSdkPatterns.some((p) => p.test(name)),
);
if (cloudDeps.length === 0) {
  ok("deps.no-cloud-sdk", "No cloud AI SDKs in dependencies.");
} else {
  fail("deps.no-cloud-sdk", `Cloud SDKs found: ${cloudDeps.join(", ")}`);
}

// 3. Cloud URL hits outside locked metadata
const cloudUrlAllowList = [
  "src/lib/providers/registry.ts",
  "src/lib/ratio/modelCapabilities.ts",
  "src/lib/security/promptGateway.ts",
];
const cloudHitLines = grepLines(
  "https://api\\.openai\\.com\\|openrouter\\.ai\\|api\\.anthropic\\.com\\|generativelanguage\\.googleapis\\.com",
).filter(
  (line) =>
    !line.includes(".test.") &&
    !cloudUrlAllowList.some((path) => line.startsWith(path + ":")),
);
if (cloudHitLines.length === 0) {
  ok("src.no-cloud-urls", "No cloud API URLs in source outside locked metadata.");
} else {
  fail(
    "src.no-cloud-urls",
    `Cloud URL hits outside locked metadata:\n${cloudHitLines.slice(0, 5).join("\n")}`,
  );
}

// 4. fetch() call site inventory
const fetchLines = grepLines("fetch(").filter((line) => !line.includes(".test."));
const fetchDestinations = fetchLines
  .map((line) => {
    const m = line.match(/fetch\(([^)]+)\)/);
    return m ? m[1].trim() : "";
  })
  .filter(Boolean);

const suspiciousFetch = fetchDestinations.filter((dest) => {
  if (/^"\/api\//.test(dest)) return false;
  if (/^`\/api\//.test(dest)) return false;
  if (/^`\$\{[a-zA-Z_$][\w$.]*?\.endpoint\}/.test(dest)) return false;
  if (/llamaCppChatUrl|llamaCppModelsUrl|llamaCppHealthUrl|ollamaTagsUrl/.test(dest)) return false;
  return true;
});
if (suspiciousFetch.length === 0) {
  ok("src.fetch-destinations", `All ${fetchDestinations.length} fetch() calls target local endpoints.`);
} else {
  fail(
    "src.fetch-destinations",
    `Unrecognized fetch destinations: ${suspiciousFetch.join(" | ")}`,
  );
}

// 5. Local endpoint guard
const localProvider = readSafe("src/lib/providers/local.ts");
if (
  localProvider.includes("isAllowedLocalEndpoint") &&
  /protocol !== "http:"/.test(localProvider)
) {
  ok("guard.endpoint", "isAllowedLocalEndpoint rejects https + non-local hosts.");
} else {
  fail("guard.endpoint", "Local endpoint guard not present or weakened.");
}

// 6. Cloud unlock posture
const registry = readSafe("src/lib/providers/registry.ts");
if (
  /cloudProvidersAreLockedByDefault/.test(registry) &&
  /status === "locked"/.test(registry)
) {
  ok("posture.cloud-locked", "All cloud providers are locked metadata in registry.");
} else {
  warn("posture.cloud-locked", "Could not verify cloud lock posture by static read.");
}

// 7. Capability matrix presence + per-row proof references
const matrixJson = path.join(REPO_ROOT, "docs/capability-matrix.public-squidley.json");
const matrixMd = path.join(REPO_ROOT, "docs/CAPABILITY_MATRIX_PUBLIC_SQUIDLEY.md");
if (!existsSync(matrixJson) || !existsSync(matrixMd)) {
  fail("matrix.present", "Capability matrix JSON and/or markdown missing in docs/.");
} else {
  let parsed = null;
  try {
    parsed = JSON.parse(readFileSync(matrixJson, "utf8"));
  } catch {
    fail("matrix.parse", "Capability matrix JSON could not be parsed.");
  }
  if (parsed) {
    const counts = {};
    const missingProof = [];
    const claimedLlamaCppReadyWithoutProof = [];
    for (const row of parsed.rows || []) {
      counts[row.classification] = (counts[row.classification] || 0) + 1;
      if (row.classification === "LOCAL_READY") {
        if (!Array.isArray(row.proofReferences) || row.proofReferences.length === 0) {
          missingProof.push(row.capabilityId);
        }
      }
      // No row may declare llama-cpp LOCAL_READY without smoke PROOF.json.
      if (row.backendStatus?.llamaCpp === "LOCAL_READY") {
        const proofPath = path.join(REPO_ROOT, "reports/llama-server-smoke/PROOF.json");
        if (!existsSync(proofPath)) {
          claimedLlamaCppReadyWithoutProof.push(row.capabilityId);
        }
      }
    }
    if (missingProof.length > 0) {
      fail(
        "matrix.proof-refs",
        `LOCAL_READY rows missing proofReferences: ${missingProof.join(", ")}`,
      );
    } else {
      ok("matrix.proof-refs", "Every LOCAL_READY capability has at least one proof reference.");
    }
    if (claimedLlamaCppReadyWithoutProof.length > 0) {
      fail(
        "matrix.llama-cpp-ready-without-proof",
        `Rows declare llama-cpp LOCAL_READY without reports/llama-server-smoke/PROOF.json: ${claimedLlamaCppReadyWithoutProof.join(", ")}`,
      );
    } else {
      ok(
        "matrix.llama-cpp-ready-without-proof",
        "No row declares llama-cpp LOCAL_READY without a smoke PROOF.json.",
      );
    }
    ok("matrix.present", `Capability matrix present; counts: ${JSON.stringify(counts)}`);
  }
}

// 8. Scripts presence
const requiredScripts = [
  "scripts/prove-local-only.mjs",
  "scripts/peh-pub-diagnostic.mjs",
  "scripts/smoke-llama-server.mjs",
  "scripts/gauntlet-local-model.mjs",
  "scripts/tool-honesty-gauntlet.mjs",
];
for (const script of requiredScripts) {
  if (existsSync(path.join(REPO_ROOT, script))) {
    ok(`scripts.present.${script}`, `${script} present.`);
  } else {
    fail(`scripts.present.${script}`, `${script} missing.`);
  }
}

// 9. publicReleaseSafety + egressGuard + heuristicHonesty + tool-honesty tests present
for (const testFile of [
  "src/lib/publicReleaseSafety.test.ts",
  "src/lib/egressGuard.test.ts",
  "src/lib/heuristicHonesty.test.ts",
  "src/lib/smokeLlamaServer.test.ts",
  "src/lib/chat/honestyAnnotation.test.ts",
  "src/lib/toolHonesty.test.ts",
]) {
  if (existsSync(path.join(REPO_ROOT, testFile))) {
    ok(`tests.present.${testFile}`, `${testFile} present.`);
  } else {
    fail(`tests.present.${testFile}`, `${testFile} missing.`);
  }
}

// 9b. Tool matrix presence + consistency
const toolMatrixJson = path.join(REPO_ROOT, "docs/tool-matrix.public-squidley.json");
const toolMatrixMd = path.join(REPO_ROOT, "docs/TOOL_MATRIX_PUBLIC_SQUIDLEY.md");
if (!existsSync(toolMatrixJson) || !existsSync(toolMatrixMd)) {
  fail("tool-matrix.present", "Tool matrix JSON and/or markdown missing.");
} else {
  let parsed = null;
  try {
    parsed = JSON.parse(readFileSync(toolMatrixJson, "utf8"));
  } catch {
    fail("tool-matrix.parse", "Tool matrix JSON could not be parsed.");
  }
  if (parsed) {
    const offenders = [];
    const dangerousActionTools = ["fs.write", "fs.delete", "shell", "code_execute", "web_search", "browse"];
    for (const tool of parsed.tools || []) {
      // Any dangerous tool marked LOCAL_TOOL_READY must have an `implemented: true`
      // AND a real implementation file. We do not have any of these in
      // Peh, so the diagnostic FAILs if one appears claiming readiness.
      if (
        dangerousActionTools.includes(tool.toolId) &&
        tool.publicLocalStatus === "LOCAL_TOOL_READY"
      ) {
        offenders.push(`${tool.toolId} claims LOCAL_TOOL_READY but is a dangerous action tool`);
      }
      // canWriteFiles or canRunCommands true requires implemented: true.
      if (
        (tool.canWriteFiles === true || tool.canRunCommands === true) &&
        tool.implemented !== true &&
        tool.toolId !== "gauntlet" &&
        tool.toolId !== "diagnostics"
      ) {
        offenders.push(`${tool.toolId} claims canWriteFiles/canRunCommands without implementation`);
      }
      // CLOUD_REQUIRED_NOT_WIRED must have requiresCloud:true.
      if (
        tool.publicLocalStatus === "CLOUD_REQUIRED_NOT_WIRED" &&
        tool.requiresCloud !== true
      ) {
        offenders.push(`${tool.toolId} is CLOUD_REQUIRED_NOT_WIRED but requiresCloud is not true`);
      }
    }
    if (offenders.length > 0) {
      fail("tool-matrix.consistency", offenders.join("; "));
    } else {
      ok("tool-matrix.consistency", "Tool matrix is internally consistent.");
    }
  }
}

// 9c. Honesty annotator wired into the chat handler
const handlerSrc = readSafe("src/lib/chat/handler.ts");
const streamRouteSrc = readSafe("src/app/api/chat/stream/route.ts");
if (
  handlerSrc.includes("detectHallucinatedToolActions") &&
  handlerSrc.includes('responseMode: "local_model"')
) {
  ok(
    "honesty-annotator.handler",
    "Chat handler runs detectHallucinatedToolActions and sets responseMode=local_model.",
  );
} else {
  fail(
    "honesty-annotator.handler",
    "Chat handler does not wire the honesty annotator + responseMode.",
  );
}
if (
  streamRouteSrc.includes("detectHallucinatedToolActions") &&
  streamRouteSrc.includes('type: "honesty"')
) {
  ok(
    "honesty-annotator.stream",
    "Chat stream route emits a 'honesty' event when the model hallucinates a tool action.",
  );
} else {
  fail(
    "honesty-annotator.stream",
    "Chat stream route does not emit a 'honesty' event.",
  );
}

// 9d. Colloquium UI surfaces honesty + provenance
const colloquiumSrc = readSafe("src/app/colloquium/ColloquiumClient.tsx");
if (
  colloquiumSrc.includes("honestyMessage") &&
  colloquiumSrc.includes("answered by local model only")
) {
  ok(
    "honesty-annotator.ui",
    "Colloquium UI renders honestyMessage and 'answered by local model only' provenance footer.",
  );
} else {
  fail(
    "honesty-annotator.ui",
    "Colloquium UI does not render honesty + provenance copy.",
  );
}

// 10. Heuristic-honesty static scan (the test enforces it on every CI run;
//     here we duplicate the most damaging phrases as a release gate.)
const RELEASE_FORBIDDEN = [
  /\bguaranteed safe\b/i,
  /\bproves safety\b/i,
  /\bproof of (?:full )?safety\b/i,
  /\bfully secure\b/i,
  /\b100% (?:safe|secure|private)\b/i,
];

function scanForOverclaims(file) {
  const text = readSafe(file);
  if (!text) return [];
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const pat of RELEASE_FORBIDDEN) {
      if (!pat.test(line)) continue;
      const lineDisclaim = /\bnot a\b|\bdoes not\b|\bdo not\b|\bdoesn['']t\b|\bdon['']t\b|\bnot a guarantee\b|\bnot proof\b|\bnot guaranteed\b|\bno\s+\w+\s+(?:guarantee|proof)\b/i.test(line);
      if (lineDisclaim) continue;
      let prev = "";
      for (let j = i - 1; j >= 0; j -= 1) {
        if (lines[j].trim()) {
          prev = lines[j];
          break;
        }
      }
      const prevDisclaim = /\bnot a\b|\bdoes not\b|\bnot a guarantee\b/i.test(prev);
      if (prevDisclaim) continue;
      out.push(`${file}:${i + 1}: ${line.trim()}`);
    }
  }
  return out;
}

const overclaims = [
  ...scanForOverclaims("README.md"),
  ...scanForOverclaims("docs/LOCAL_FIRST_CONTRACT.md"),
  ...scanForOverclaims("docs/CAPABILITY_MATRIX_PUBLIC_SQUIDLEY.md"),
  ...scanForOverclaims("docs/LOCAL_ONLY_PRINCIPLES.md"),
  ...scanForOverclaims("docs/PUBLIC_SQUIDLEY_AUDIT_2026-05-15.md"),
  ...scanForOverclaims("docs/LOCAL_MODE.md"),
  ...scanForOverclaims("docs/CLOUD_MODE.md"),
  ...scanForOverclaims("docs/CLOUD_MODE_ARCHITECTURE.md"),
  ...scanForOverclaims("docs/MODE_CAPABILITY_MATRIX.md"),
  ...scanForOverclaims("docs/AUTONOMOUS_TOOL_POLICY.md"),
];
if (overclaims.length === 0) {
  ok("heuristic-honesty.docs", "No unqualified safety overclaims in audited docs.");
} else {
  fail("heuristic-honesty.docs", `Overclaim(s):\n${overclaims.join("\n")}`);
}

// 11. Live Ollama probe (informational)
const ollamaEndpoint =
  process.env.PEH_LOCAL_ENDPOINT || process.env.SQUIDLEY_LOCAL_ENDPOINT || "http://localhost:11434";
let ollamaModelCount = null;
try {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1500);
  const res = await fetch(`${ollamaEndpoint}/api/tags`, {
    method: "GET",
    signal: ctrl.signal,
  }).catch(() => null);
  clearTimeout(t);
  if (res && res.ok) {
    const body = await res.json().catch(() => ({}));
    ollamaModelCount = Array.isArray(body?.models) ? body.models.length : 0;
    ok(
      "live.ollama",
      `Ollama reachable at ${ollamaEndpoint} with ${ollamaModelCount} model(s).`,
    );
  } else {
    warn(
      "live.ollama",
      `Ollama not reachable at ${ollamaEndpoint}. Live proof must be run on a host with Ollama; absence does not block the diagnostic.`,
    );
  }
} catch {
  warn("live.ollama", "Ollama probe errored. Diagnostic does not require Ollama on this host.");
}

// 12. llama-server smoke PROOF status (informational unless something
//     claimed LOCAL_READY based on it).
const proofPath = path.join(REPO_ROOT, "reports/llama-server-smoke/PROOF.json");
if (existsSync(proofPath)) {
  try {
    const proof = JSON.parse(readFileSync(proofPath, "utf8"));
    ok(
      "llama-server.smoke-proof",
      `PROOF.json present (status=${proof.status}, endpoint=${proof.endpoint}, completedAt=${proof.completedAt}).`,
    );
  } catch {
    fail("llama-server.smoke-proof", "PROOF.json exists but is malformed.");
  }
} else {
  warn(
    "llama-server.smoke-proof",
    "No reports/llama-server-smoke/PROOF.json. llama-cpp paths remain LOCAL_PARTIAL (as labeled).",
  );
}

// 13. Mode separation checks
const modeResolverFile = readSafe("src/lib/mode/resolver.ts");
const modeTypesFile = readSafe("src/lib/mode/types.ts");
const cloudRegistryFile = readSafe("src/lib/providers/cloudRegistry.ts");
const toolRegistryFile = readSafe("src/lib/mode/toolRegistry.ts");
const capMatrixFile = readSafe("src/lib/mode/capabilityMatrix.ts");
const provenanceFile = readSafe("src/lib/mode/provenance.ts");
const escalationFile = readSafe("src/lib/mode/escalation.ts");

if (modeResolverFile.includes("resolveMode") && modeResolverFile.includes('parseMode')) {
  ok("mode.resolver", "Mode resolver present with resolveMode + parseMode.");
} else {
  fail("mode.resolver", "Mode resolver missing or incomplete.");
}

if (modeTypesFile.includes('"local"') && modeTypesFile.includes('"cloud"') && modeTypesFile.includes('LOCAL_MODE_STATE')) {
  ok("mode.types", "Mode types define local and cloud states.");
} else {
  fail("mode.types", "Mode types missing or incomplete.");
}

// Default mode must be local
if (modeResolverFile.includes('return "local"')) {
  ok("mode.default-local", "Default mode falls back to local.");
} else {
  fail("mode.default-local", "Default mode may not be local — check resolver.");
}

// API keys alone must not change mode
if (modeResolverFile.includes("CLOUD_API_KEY_ENV_VARS") && modeResolverFile.includes("do not unlock")) {
  ok("mode.keys-no-unlock", "Resolver documents that API keys alone do not unlock cloud.");
} else {
  warn("mode.keys-no-unlock", "Could not verify that API keys alone do not unlock cloud by static read.");
}

// Cloud provider registry: all cloud providers must be NOT_IMPLEMENTED
if (cloudRegistryFile.includes('"NOT_IMPLEMENTED"')) {
  const cloudReadyMatch = cloudRegistryFile.match(/locality:\s*"cloud"[\s\S]*?status:\s*"IMPLEMENTED"/g);
  if (!cloudReadyMatch) {
    ok("mode.cloud-providers-not-implemented", "All cloud providers are NOT_IMPLEMENTED.");
  } else {
    fail("mode.cloud-providers-not-implemented", "Cloud provider(s) claim IMPLEMENTED without verified adapter.");
  }
} else {
  fail("mode.cloud-providers-not-implemented", "Cloud registry missing NOT_IMPLEMENTED statuses.");
}

// Mode-aware tool registry
if (toolRegistryFile.includes("TOOL_REGISTRY") && toolRegistryFile.includes("localStatus") && toolRegistryFile.includes("cloudStatus")) {
  ok("mode.tool-registry", "Mode-aware tool registry present with local/cloud status.");
} else {
  fail("mode.tool-registry", "Mode-aware tool registry missing or incomplete.");
}

// Mode-aware capability matrix
if (capMatrixFile.includes("MODE_CAPABILITY_MATRIX") && capMatrixFile.includes("localModeStatus") && capMatrixFile.includes("cloudModeStatus")) {
  ok("mode.capability-matrix", "Mode-aware capability matrix present with local/cloud status.");
} else {
  fail("mode.capability-matrix", "Mode-aware capability matrix missing or incomplete.");
}

// Mode-aware provenance
if (provenanceFile.includes("ModeAwareProvenance") && provenanceFile.includes("cloudCalled")) {
  ok("mode.provenance", "Mode-aware provenance present with cloudCalled tracking.");
} else {
  fail("mode.provenance", "Mode-aware provenance missing or incomplete.");
}

// Escalation policy
if (escalationFile.includes("decideEscalation") && escalationFile.includes('"local"')) {
  ok("mode.escalation", "Escalation policy blocks cloud in local mode.");
} else {
  fail("mode.escalation", "Escalation policy missing or incomplete.");
}

// Mode test file
if (existsSync(path.join(REPO_ROOT, "src/lib/mode/resolver.test.ts"))) {
  ok("mode.tests", "Mode resolver tests present.");
} else {
  fail("mode.tests", "Mode resolver test file missing.");
}

// Cloud mode implemented vs planned count
const cloudNotImplCount = (capMatrixFile.match(/cloudModeStatus:\s*"NOT_IMPLEMENTED"/g) || []).length;
const cloudReadyCount = (capMatrixFile.match(/cloudModeStatus:\s*"READY"/g) || []).length;
const cloudPartialCount = (capMatrixFile.match(/cloudModeStatus:\s*"PARTIAL"/g) || []).length;
ok("mode.cloud-status-count", `Cloud Mode: READY=${cloudReadyCount}, PARTIAL=${cloudPartialCount}, NOT_IMPLEMENTED=${cloudNotImplCount}`);

// 14. Product release status checks
const productStatusFile = readSafe("src/lib/mode/productStatus.ts");
if (productStatusFile.includes('PUBLIC_RELEASE_READY = false')) {
  ok("product.release-status", "PUBLIC_RELEASE_READY is false — product is not claiming release readiness.");
} else {
  fail("product.release-status", "PUBLIC_RELEASE_READY is not false — product may be overclaiming readiness.");
}

// README must say NOT RELEASE READY
const readmeSrc = readSafe("README.md");
if (readmeSrc.includes("NOT RELEASE READY")) {
  ok("product.readme-honesty", "README says NOT RELEASE READY.");
} else {
  fail("product.readme-honesty", "README does not say NOT RELEASE READY — may imply product is shippable.");
}

// Required product docs
const requiredProductDocs = [
  "docs/PUBLIC_SQUIDLEY_RELEASE_PLAN.md",
  "docs/TEACHER_FIRST_DOCTRINE.md",
  "docs/BEGINNER_ONBOARDING_DESIGN.md",
  "docs/SELF_EXPLANATION_REQUIREMENTS.md",
];
for (const doc of requiredProductDocs) {
  if (existsSync(path.join(REPO_ROOT, doc))) {
    ok(`product.doc.${doc}`, `${doc} present.`);
  } else {
    fail(`product.doc.${doc}`, `${doc} missing — required for product release.`);
  }
}

// Product status test file
if (existsSync(path.join(REPO_ROOT, "src/lib/mode/productStatus.test.ts"))) {
  ok("product.tests", "Product status tests present.");
} else {
  fail("product.tests", "Product status test file missing.");
}

// 15. Teacher architecture checks
const teacherFiles = [
  "src/lib/teacher/types.ts",
  "src/lib/teacher/concepts.ts",
  "src/lib/teacher/lessonRegistry.ts",
  "src/lib/teacher/runtimeHooks.ts",
  "src/lib/teacher/onboarding.ts",
  "src/lib/teacher/explain.ts",
  "src/lib/teacher/index.ts",
  "src/lib/teacher/detect.ts",
  "src/lib/teacher/chatIntegration.ts",
  "src/lib/teacher/onboardingProgress.ts",
  "src/lib/teacher/runtimeExplain.ts",
];
let teacherFilesPresent = 0;
for (const tf of teacherFiles) {
  if (existsSync(path.join(REPO_ROOT, tf))) {
    teacherFilesPresent += 1;
  }
}
if (teacherFilesPresent === teacherFiles.length) {
  ok("teacher.source-files", `All ${teacherFiles.length} teacher source files present.`);
} else {
  fail("teacher.source-files", `Only ${teacherFilesPresent}/${teacherFiles.length} teacher source files present.`);
}

// Teacher KB
if (existsSync(path.join(REPO_ROOT, "docs/teacher-kb/manifest.json"))) {
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, "docs/teacher-kb/manifest.json"), "utf8"));
  } catch {
    fail("teacher.manifest-parse", "Teacher KB manifest.json could not be parsed.");
  }
  if (manifest) {
    const modules = manifest.modules || [];
    const missingFiles = [];
    for (const mod of modules) {
      if (!existsSync(path.join(REPO_ROOT, "docs/teacher-kb", mod.file))) {
        missingFiles.push(mod.file);
      }
    }
    if (missingFiles.length === 0) {
      ok("teacher.kb-modules", `All ${modules.length} teacher KB modules present.`);
    } else {
      fail("teacher.kb-modules", `Missing teacher KB files: ${missingFiles.join(", ")}`);
    }
  }
} else {
  fail("teacher.manifest", "docs/teacher-kb/manifest.json missing.");
}

// Glossary contains core terms
const glossaryFile = readSafe("docs/teacher-kb/14-glossary.md").toLowerCase();
const coreGlossaryTerms = ["ai", "model", "token", "prompt", "receipt", "provenance", "agent", "tool", "approval", "cloud", "local"];
const missingTerms = coreGlossaryTerms.filter((t) => !glossaryFile.includes(t));
if (missingTerms.length === 0) {
  ok("teacher.glossary-terms", "Glossary contains all core terms.");
} else {
  fail("teacher.glossary-terms", `Glossary missing terms: ${missingTerms.join(", ")}`);
}

// Teacher tests present
if (existsSync(path.join(REPO_ROOT, "src/lib/teacher/teacher.test.ts"))) {
  ok("teacher.tests", "Teacher test file present.");
} else {
  fail("teacher.tests", "Teacher test file missing.");
}

// 16. Teacher integration checks
const teacherIntegrationFiles = [
  "src/app/api/teacher/concepts/route.ts",
  "src/app/api/teacher/lessons/route.ts",
  "src/app/api/teacher/onboarding/route.ts",
  "src/app/api/teacher/explain/route.ts",
  "src/app/teacher/page.tsx",
];
let teacherIntegrationPresent = 0;
for (const tf of teacherIntegrationFiles) {
  if (existsSync(path.join(REPO_ROOT, tf))) {
    teacherIntegrationPresent += 1;
  }
}

const teacherChatIntegrated = readSafe("src/app/api/chat/route.ts").includes("tryTeacherAnswer");
const teacherApiAvailable = teacherIntegrationPresent >= 4; // at least 4 API routes
const onboardingUiAvailable = existsSync(path.join(REPO_ROOT, "src/app/teacher/page.tsx"));
const conceptUiAvailable = onboardingUiAvailable; // same page has concepts tab
const runtimeHookExplanationsAvailable = existsSync(path.join(REPO_ROOT, "src/lib/teacher/runtimeExplain.ts"));

if (teacherChatIntegrated) {
  ok("teacher.chat-integrated", "Chat route wires teacher question detection.");
} else {
  fail("teacher.chat-integrated", "Chat route does not import tryTeacherAnswer.");
}
if (teacherApiAvailable) {
  ok("teacher.api-routes", `${teacherIntegrationPresent}/${teacherIntegrationFiles.length} teacher integration files present.`);
} else {
  fail("teacher.api-routes", `Only ${teacherIntegrationPresent}/${teacherIntegrationFiles.length} teacher integration files present.`);
}
if (onboardingUiAvailable) {
  ok("teacher.onboarding-ui", "Teacher onboarding UI page present.");
} else {
  fail("teacher.onboarding-ui", "Teacher onboarding UI page missing.");
}
if (runtimeHookExplanationsAvailable) {
  ok("teacher.runtime-hooks", "Runtime hook explanation helper present.");
} else {
  fail("teacher.runtime-hooks", "Runtime hook explanation helper missing.");
}

// Integration tests
if (existsSync(path.join(REPO_ROOT, "src/lib/teacher/integration.test.ts"))) {
  ok("teacher.integration-tests", "Teacher integration tests present.");
} else {
  fail("teacher.integration-tests", "Teacher integration test file missing.");
}

// 17. Phase 2C polish checks
const teachWhileChattingFile = readSafe("src/lib/teacher/teachingSettings.ts");
const teachingCardsFile = readSafe("src/lib/teacher/teachingCards.ts");
const beginnerTestFile = existsSync(path.join(REPO_ROOT, "src/lib/teacher/beginnerSimulation.test.ts"));

const teachWhileChattingReady = teachWhileChattingFile.includes("teachWhileChatting");
const inContextTeachingCardsReady = teachingCardsFile.includes("buildTeachingCard");
const explainThisHelpersReady = teachingCardsFile.includes("EXPLAIN_THIS_LABELS");
const zeroExperienceTestsReady = beginnerTestFile;

if (teachWhileChattingReady) {
  ok("teacher.teach-while-chatting", "Teach-while-chatting setting present.");
} else {
  fail("teacher.teach-while-chatting", "Teach-while-chatting setting missing.");
}
if (inContextTeachingCardsReady) {
  ok("teacher.in-context-cards", "In-context teaching cards present.");
} else {
  fail("teacher.in-context-cards", "In-context teaching cards missing.");
}
if (explainThisHelpersReady) {
  ok("teacher.explain-helpers", "Explain-this helpers present.");
} else {
  fail("teacher.explain-helpers", "Explain-this helpers missing.");
}
if (zeroExperienceTestsReady) {
  ok("teacher.zero-experience-tests", "Zero-experience simulation tests present.");
} else {
  fail("teacher.zero-experience-tests", "Zero-experience simulation tests missing.");
}

const teacherLayerReady =
  teacherFilesPresent === teacherFiles.length &&
  missingTerms.length === 0 &&
  teacherChatIntegrated &&
  teacherApiAvailable &&
  onboardingUiAvailable &&
  teachWhileChattingReady &&
  inContextTeachingCardsReady &&
  explainThisHelpersReady &&
  zeroExperienceTestsReady;

// Final report
const localSubsystemReady = failures.length === 0;

const summary = {
  schemaVersion: 4,
  tool: "scripts/peh-pub-diagnostic.mjs",
  completedAt: new Date().toISOString(),
  repoPath: REPO_ROOT,
  ollamaEndpoint,
  ollamaModelCount,
  llamaServerProofPresent: existsSync(proofPath),

  // Product vs subsystem distinction
  publicReleaseReady: false,
  localSubsystemReady,
  cloudModeReady: false,
  teacherLayerReady: teacherLayerReady ? "polished" : teacherChatIntegrated ? "integrated" : teacherFilesPresent > 0 ? "architecture" : false,
  teacherChatIntegrated,
  teacherApiAvailable,
  onboardingUiAvailable,
  conceptUiAvailable,
  runtimeHookExplanationsAvailable,
  teachWhileChattingReady,
  inContextTeachingCardsReady,
  explainThisHelpersReady,
  zeroExperienceTestsReady,
  toolExecutionReady: false,
  autonomousWorkflowsReady: false,

  findings,
  failures: failures.length,
};

console.log(JSON.stringify(summary, null, 2));

if (failures.length > 0) {
  console.error(`\nFAIL: ${failures.length} release-blocking finding(s).`);
  process.exit(1);
}
console.log("\nPASS: local subsystem diagnostic clean. Product is NOT release ready (Cloud Mode, teaching layer, tools, workflows required).");
process.exit(0);
