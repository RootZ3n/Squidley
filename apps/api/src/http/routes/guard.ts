// apps/api/src/http/routes/guard.ts
import type { FastifyInstance } from "fastify";
import { loadConfig, newReceiptId, writeReceipt, type ReceiptV1 } from "@zensquid/core";

export type GuardResult = {
  blocked: boolean;
  warned?: boolean;
  tier?: "allow" | "warn" | "block";
  reason?: string;
  score: number;
  signals: string[];
  signal_count?: number;
  matched_pattern?: string | null;
};

function preview(s: unknown, n = 140): string {
  const t = String(s ?? "");
  const oneLine = t.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}

/**
 * Layer 1: obvious injection (fast + deterministic)
 */
function detectPromptInjectionV1(input: string): { blocked: boolean; reason?: string; matched?: string } {
  const s = (input ?? "").toLowerCase();

  const patterns: Array<{ id: string; re: RegExp }> = [
    { id: "ignore_previous", re: /\bignore (all|any|the) (previous|prior) (instructions|rules|messages)\b/i },
    { id: "override_system", re: /\boverride (the )?(system|developer) (prompt|message|instructions)\b/i },
    { id: "reveal_system", re: /\b(reveal|show|print|dump|leak) (the )?(system|developer) (prompt|message|instructions)\b/i },
    { id: "bypass_safety", re: /\b(bypass|disable|remove) (safety|filters|guardrails|policy)\b/i },
    { id: "act_as_root", re: /\b(act as|you are now|pretend to be) (root|administrator|admin|system)\b/i }
  ];

  for (const p of patterns) {
    if (p.re.test(s)) return { blocked: true, reason: `prompt_injection:${p.id}`, matched: p.id };
  }

  return { blocked: false };
}

/**
 * Layer 2: intent scoring (still deterministic)
 */
function scoreSuspiciousIntent(input: string): { score: number; signals: string[]; matchedPattern?: string } {
  const s = String(input ?? "").toLowerCase();

  const signals: string[] = [];
  let score = 0;

  const add = (pts: number, sig: string) => {
    score += pts;
    if (!signals.includes(sig)) signals.push(sig);
  };

  const exfilPatterns: Array<{ id: string; pts: number; re: RegExp }> = [
    // “internal rules / hidden instructions / list your rules” MUST be treated as exfil, not “maybe”
    { id: "ask_hidden_instructions", pts: 6, re: /\b(hidden|internal|secret|private)\s+(instructions|rules|prompt|policies)\b/i },
    { id: "ask_system_prompt_generic", pts: 4, re: /\b(system\s+prompt|your\s+system\s+message|the\s+system\s+prompt)\b/i },
    { id: "ask_developer_prompt_generic", pts: 4, re: /\b(developer\s+prompt|your\s+developer\s+message)\b/i },
    { id: "ask_show_rules", pts: 6, re: /\b(show|list|print|dump|reveal|display)\s+(your|the)\s+(rules|instructions|prompt|policies)\b/i },
    { id: "ask_what_rules_following", pts: 6, re: /\b(what|which)\s+(rules|instructions|policies)\s+(are you|you are)\s+(following|using)\b/i },
    { id: "ask_configuration_dump", pts: 6, re: /\b(dump|print|show|reveal)\s+(config|configuration|settings|env|environment)\b/i },
    { id: "ask_tokens_keys", pts: 9, re: /\b(api[_\s-]?key|bearer\s+token|auth\s+token|secret\s+key|private\s+key|password|credentials)\b/i }
  ];

  for (const p of exfilPatterns) {
    if (p.re.test(s)) add(p.pts, `exfil:${p.id}`);
  }

  const toolSteer: Array<{ id: string; pts: number; re: RegExp }> = [
    { id: "run_command", pts: 3, re: /\b(run|execute)\s+(this|the)\s+(command|cmd)\b/i },
    { id: "paste_and_run", pts: 3, re: /\b(paste|copy)\s+.*\b(run|execute)\b/i },
    { id: "curl_pipe_shell", pts: 9, re: /\bcurl\b.*\|\s*(sh|bash)\b/i },
    { id: "disable_safety_generic", pts: 9, re: /\bdisable\b.*\b(safety|guard|filters|policy)\b/i }
  ];

  for (const p of toolSteer) {
    if (p.re.test(s)) add(p.pts, `tool_steer:${p.id}`);
  }

  if (/\b(verbatim|exactly|word[-\s]?for[-\s]?word|raw)\b/i.test(s)) add(2, "style:verbatim_or_raw");

  // Benign framing nudges score down a bit (but NEVER un-block hard exfil triggers)
  if (/\b(explain|in general|generally|concept|definition)\b/i.test(s)) add(-2, "benign:general_explanation");

  // Architecture / dev discussion bypass — these are normal dev conversations
  const devTopics = /\b(architecture|governance|token\s+monitor|token\s+usage|model\s+routing|agent\s+design|planner|pipeline|capability\s+gate|build\s+tab|tool\s+loop|brainstorm|refactor|codebase|squidley|tenticode|receipt|skill[- ]builder)\b/i;
  if (devTopics.test(s)) add(-4, "benign:dev_architecture_discussion");

  // Coding discussions are normal — mentioning "system" in architecture context
  if (/\b(operating system|file system|build system|type system|distributed system|event system|routing system|messaging system)\b/i.test(s)) add(-3, "benign:system_noun_context");

  if (score < 0) score = 0;

  const matchedPattern = signals.length > 0 ? signals[0] : undefined;
  return { score, signals, matchedPattern };
}

/**
 * Block rules:
 * - Certain signals are ALWAYS blocks (exfil / secrets / config dump).
 * - Otherwise, fall back to score threshold.
 */
type GuardTier = "allow" | "warn" | "block";

function guardTier(signals: string[], score: number): GuardTier {
  const hardBlockPrefixes = [
    "exfil:ask_hidden_instructions",
    "exfil:ask_show_rules",
    "exfil:ask_what_rules_following",
    "exfil:ask_configuration_dump",
    "exfil:ask_tokens_keys",
    "tool_steer:curl_pipe_shell",
    "tool_steer:disable_safety_generic"
  ];

  for (const p of hardBlockPrefixes) {
    if (signals.some((s) => s.startsWith(p))) return "block";
  }

  if (score >= 8) return "block";
  if (score >= 4) return "warn";
  return "allow";
}

function shouldBlock(signals: string[], score: number): boolean {
  return guardTier(signals, score) === "block";
}

/**
 * ✅ Shared evaluator (PURE: no receipts, no Fastify)
 * Use this in /chat and /guard/check so there is exactly one source of truth.
 */
export function evaluateGuard(inputRaw: string): GuardResult {
  const input = String(inputRaw ?? "").trim();

  // Layer 1
  const v1 = detectPromptInjectionV1(input);
  if (v1.blocked) {
    return {
      blocked: true,
      reason: v1.reason,
      score: 999,
      signals: [`v1:${v1.matched ?? "matched"}`],
      matched_pattern: v1.matched ?? null
    };
  }

  // Layer 2
  const s2 = scoreSuspiciousIntent(input);
  const tier = guardTier(s2.signals, s2.score);

  if (tier === "block") {
    return {
      blocked: true,
      warned: false,
      tier: "block",
      reason: s2.matchedPattern ?? "guard:blocked",
      score: s2.score,
      signals: s2.signals,
      signal_count: s2.signals.length,
      matched_pattern: s2.matchedPattern ?? null
    };
  }

  return {
    blocked: false,
    warned: tier === "warn",
    tier,
    reason: tier === "warn" ? (s2.matchedPattern ?? "guard:low_confidence") : undefined,
    score: s2.score,
    signals: s2.signals,
    signal_count: s2.signals.length,
    matched_pattern: s2.matchedPattern ?? null
  };
}

export async function registerGuardRoutes(
  app: FastifyInstance,
  deps: {
    zensquidRoot: () => string;
  }
): Promise<void> {
  app.post("/guard/check", async (req, reply) => {
    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const body = (req.body ?? {}) as any;

    const input = typeof body?.input === "string" ? body.input.trim() : "";
    if (!input) return reply.code(400).send({ ok: false, error: "Missing input" });

    const res = evaluateGuard(input);

    // If blocked, write a receipt
    if (res.blocked) {
      const receipt_id = newReceiptId();

      const receipt: any = {
        schema: "zensquid.receipt.v1",
        receipt_id,
        created_at: new Date().toISOString(),
        node: cfg.meta.node,
        request: { input: `[guard.check] ${preview(input, 200)}`, kind: "system" },
        decision: {
          tier: "guard",
          provider: "local",
          model: res.score === 999 ? "prompt-injection-guard" : "intent-score-guard",
          escalated: false,
          escalation_reason: null
        },
        guard_event: {
          blocked: true,
          reason: res.reason ?? "guard:blocked",
          score: res.score,
          signals: res.signals,
          matched_pattern: res.matched_pattern ?? null
        }
      };

      await writeReceipt(deps.zensquidRoot(), receipt as ReceiptV1);

      return reply.send({
        ok: true,
        blocked: true,
        reason: res.reason ?? "guard:blocked",
        score: res.score,
        signals: res.signals,
        receipt_id
      });
    }

    // Allowed
    return reply.send({
      ok: true,
      blocked: false,
      reason: null,
      score: res.score,
      signals: res.signals
    });
  });
}