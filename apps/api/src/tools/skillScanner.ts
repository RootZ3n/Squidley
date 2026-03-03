// apps/api/src/tools/skillScanner.ts
//
// Layer 1 deterministic skill scanner.
// Reads skill files as raw text and checks for injection patterns,
// suspicious content, encoding tricks, and capability abuse.
// Never executes skill content — purely text analysis.

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "BLOCK";

export type ScanFinding = {
  rule: string;
  level: RiskLevel;
  match: string;
  line?: number;
};

export type ScanResult = {
  path: string;
  risk: RiskLevel;
  findings: ScanFinding[];
  line_count: number;
  scanned_at: string;
};

// ── Detection rules ───────────────────────────────────────────────────────────

type Rule = {
  id: string;
  level: RiskLevel;
  pattern: RegExp;
  description: string;
};

const RULES: Rule[] = [
  // ── BLOCK: Hard injection attempts ─────────────────────────────────────────
  {
    id: "injection.ignore_instructions",
    level: "BLOCK",
    pattern: /ignore\s+(all\s+)?(previous|prior|above|your)\s+instructions/i,
    description: "Classic prompt injection: ignore instructions",
  },
  {
    id: "injection.disregard",
    level: "BLOCK",
    pattern: /disregard\s+(all\s+)?(previous|prior|above|your)\s+instructions/i,
    description: "Prompt injection: disregard instructions",
  },
  {
    id: "injection.new_instructions",
    level: "BLOCK",
    pattern: /your\s+(new|real|actual|true)\s+instructions\s+(are|is)/i,
    description: "Prompt injection: override instructions",
  },
  {
    id: "injection.act_as",
    level: "BLOCK",
    pattern: /\bact\s+as\s+(a\s+)?(different|another|new|unrestricted|jailbroken)\b/i,
    description: "Prompt injection: act as different AI",
  },
  {
    id: "injection.jailbreak",
    level: "BLOCK",
    pattern: /\b(jailbreak|DAN|do anything now|no restrictions|bypass (safety|policy|filter))\b/i,
    description: "Jailbreak attempt",
  },
  {
    id: "injection.system_override",
    level: "BLOCK",
    pattern: /\[SYSTEM\]|\[INST\]|\[OVERRIDE\]|<\|system\|>/i,
    description: "System prompt injection via special tokens",
  },

  // ── BLOCK: Impersonation ────────────────────────────────────────────────────
  {
    id: "impersonation.anthropic",
    level: "BLOCK",
    pattern: /\b(from|sent by|on behalf of|authorized by)\s+anthropic\b/i,
    description: "Impersonating Anthropic",
  },
  {
    id: "impersonation.squidley_core",
    level: "BLOCK",
    pattern: /\b(squidley'?s?\s+core|core\s+system|zensquid\s+core)\s+(says?|requires?|instructs?|demands?)\b/i,
    description: "Impersonating Squidley core system",
  },
  {
    id: "impersonation.admin",
    level: "BLOCK",
    pattern: /\b(admin|administrator)\s+(has\s+)?(approved|authorized|granted|enabled)\b/i,
    description: "False admin authorization claim",
  },

  // ── BLOCK: Encoding tricks ──────────────────────────────────────────────────
  {
    id: "encoding.base64_blob",
    level: "BLOCK",
    pattern: /[A-Za-z0-9+/]{80,}={0,2}/,
    description: "Large base64 blob — possible encoded payload",
  },
  {
    id: "encoding.zero_width",
    level: "BLOCK",
    pattern: /[\u200b\u200c\u200d\u200e\u200f\ufeff]/,
    description: "Zero-width characters — possible hidden content",
  },
  {
    id: "encoding.unicode_lookalike",
    level: "HIGH",
    pattern: /[\u0430\u0435\u043e\u0440\u0441\u0445\u04cf]/,
    description: "Cyrillic lookalike characters — possible homoglyph attack",
  },

  // ── HIGH: Suspicious capability requests ───────────────────────────────────
  {
    id: "capability.godmode",
    level: "HIGH",
    pattern: /\b(godmode|god_mode|god mode|full.?access|unrestricted.?access)\b/i,
    description: "Requesting godmode or unrestricted access",
  },
  {
    id: "capability.admin_token",
    level: "HIGH",
    pattern: /\b(admin.?token|zensquid.?admin|x-zensquid)\b/i,
    description: "References admin token — possible credential harvesting",
  },
  {
    id: "capability.disable_safety",
    level: "HIGH",
    pattern: /\b(disable|bypass|skip|ignore)\s+(safety|guard|policy|approval|gate|budget)\b/i,
    description: "Attempting to disable safety systems",
  },

  // ── HIGH: Suspicious tool proposals ────────────────────────────────────────
  {
    id: "tool.exfil_network",
    level: "HIGH",
    pattern: /\b(curl|wget|fetch|http\.post|http\.get)\b.{0,80}\b(password|token|secret|key|credential)\b/i,
    description: "Possible credential exfiltration via network call",
  },
  {
    id: "tool.write_outside_skills",
    level: "HIGH",
    pattern: /fs\.write.{0,40}(?!skills\/|memory\/)\/[a-zA-Z]/i,
    description: "fs.write targeting path outside skills/ or memory/",
  },
  {
    id: "tool.proc_exec_suspicious",
    level: "HIGH",
    pattern: /proc\.exec.{0,80}(curl|wget|nc|netcat|bash|sh|python|eval)/i,
    description: "proc.exec with suspicious command (network/shell)",
  },

  // ── MEDIUM: Suspicious patterns ────────────────────────────────────────────
  {
    id: "medium.external_url",
    level: "MEDIUM",
    pattern: /https?:\/\/(?!127\.0\.0\.1|localhost|0\.0\.0\.0)[a-zA-Z0-9\-_.]+\.[a-zA-Z]{2,}/i,
    description: "External URL reference — verify intent",
  },
  {
    id: "medium.always_keyword",
    level: "MEDIUM",
    pattern: /\b(always|never|must|required to|you must)\b.{0,60}\b(send|fetch|call|post|get|connect)\b/i,
    description: "Mandatory network action instruction",
  },
  {
    id: "medium.check_url",
    level: "MEDIUM",
    pattern: /\b(check|visit|fetch|call)\b.{0,40}\b(this url|this link|this endpoint|the following url)\b/i,
    description: "Instruction to visit external URL",
  },
  {
    id: "medium.persona_shift",
    level: "MEDIUM",
    pattern: /\byou are (now |actually |really )?(a |an )?(different|new|another|custom)\b/i,
    description: "Persona shift attempt",
  },
];

// ── Scanner ───────────────────────────────────────────────────────────────────

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const order: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "BLOCK"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

export function scanSkillText(skillPath: string, text: string): ScanResult {
  // Known-safe internal skills — skip HIGH/MEDIUM rules, only flag BLOCK
  const knownSafe = text.includes("scanner: known-safe internal skill");
  const lines = text.split("\n");
  const findings: ScanFinding[] = [];

  for (const rule of RULES) {
    // Check full text first
    if (rule.pattern.test(text)) {
      // Find which line
      let matchLine: number | undefined;
      for (let i = 0; i < lines.length; i++) {
        if (rule.pattern.test(lines[i])) {
          matchLine = i + 1;
          break;
        }
      }
      // Get match snippet
      const m = text.match(rule.pattern);
      const snippet = m ? m[0].slice(0, 80) : "";
      if (knownSafe && rule.level !== "BLOCK") continue;
      findings.push({
        rule: rule.id,
        level: rule.level,
        match: snippet,
        line: matchLine,
      });
    }
  }

  const risk: RiskLevel = findings.length === 0
    ? "LOW"
    : findings.reduce((acc, f) => maxRisk(acc, f.level), "LOW" as RiskLevel);

  return {
    path: skillPath,
    risk,
    findings,
    line_count: lines.length,
    scanned_at: new Date().toISOString(),
  };
}

export function formatScanResult(result: ScanResult): string {
  const lines: string[] = [
    `# Skill Scan: ${result.path}`,
    `Risk: ${result.risk}`,
    `Lines: ${result.line_count}`,
    `Scanned: ${result.scanned_at}`,
    "",
  ];

  if (result.findings.length === 0) {
    lines.push("✅ No issues found.");
  } else {
    lines.push(`⚠️  ${result.findings.length} finding(s):`);
    for (const f of result.findings) {
      const icon = f.level === "BLOCK" ? "🚫" : f.level === "HIGH" ? "🔴" : f.level === "MEDIUM" ? "🟡" : "🟢";
      lines.push(`  ${icon} [${f.level}] ${f.rule}${f.line ? ` (line ${f.line})` : ""}`);
      lines.push(`     Match: "${f.match}"`);
    }
  }

  return lines.join("\n");
}
