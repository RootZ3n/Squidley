import fs from "node:fs";

const FILE = "apps/api/src/server.ts";
let src = fs.readFileSync(FILE, "utf8");

function findBlockEndFrom(source, startIdx) {
  const openIdx = source.indexOf("{", startIdx);
  if (openIdx < 0) throw new Error("Could not find opening { for block.");

  let i = openIdx;
  let depth = 0;

  let inStr = false;
  let strCh = "";
  let inTpl = false;
  let inLine = false;
  let inBlock = false;
  let esc = false;

  for (; i < source.length; i++) {
    const c = source[i];
    const n = source[i + 1];

    if (inLine) {
      if (c === "\n") inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }

    if (!inStr && !inTpl) {
      if (c === "/" && n === "/") {
        inLine = true;
        i++;
        continue;
      }
      if (c === "/" && n === "*") {
        inBlock = true;
        i++;
        continue;
      }
    }

    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === strCh) {
        inStr = false;
        strCh = "";
      }
      continue;
    }

    if (inTpl) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === "`") inTpl = false;
      continue;
    }

    if (c === '"' || c === "'") {
      inStr = true;
      strCh = c;
      continue;
    }
    if (c === "`") {
      inTpl = true;
      continue;
    }

    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }

  throw new Error("Unbalanced braces; could not find end of block.");
}

function replaceBuildChatSystemPrompt() {
  const start = src.indexOf("async function buildChatSystemPrompt(");
  if (start < 0) throw new Error("buildChatSystemPrompt() not found.");

  const endBraceIdx = findBlockEndFrom(src, start);
  const end = endBraceIdx + 1;

  const replacement =
`async function buildChatSystemPrompt(args: { input: string; selected_skill?: string | null }) {
  const input = String(args?.input ?? "");
  const selected_skill = args?.selected_skill ?? null;

  const { soul, identity } = await loadAgentTexts();
  const memHits = await searchMemoryForChat(input, 5);
  const skill = selected_skill ? await loadSkillDoc(selected_skill) : "";

  const parts: string[] = [];
  parts.push(BASE_SYSTEM_PROMPT);

  if (identity?.trim?.()) parts.push("\\n---\\n# IDENTITY (agent)\\n" + identity.trim());
  if (soul?.trim?.()) parts.push("\\n---\\n# SOUL (agent)\\n" + soul.trim());
  if (skill?.trim?.()) parts.push("\\n---\\n# SELECTED SKILL: " + selected_skill + "\\n" + skill.trim());

  if (memHits.length > 0) {
    const formatted = memHits
      .map((h, i) => \`(\${i + 1}) \${h.rel}\\n\${h.snippet}\`)
      .join("\\n\\n");
    parts.push("\\n---\\n# RELEVANT MEMORY (snippets)\\n" + formatted);
  }

  parts.push(\`
---
# RULES
- Prefer local-first solutions. Do not propose cloud escalation unless the user asks or the current task truly requires it.
- Keep answers actionable and short. Provide copy/paste commands when relevant.
- If asked to edit code/configs, prefer full replacement files (not patches).
\`.trim());

  // ---- Option 1: Intelligence-visible context ----
  const wantRemember =
    /\\b(remember this|save this|add to (long\\s*term|memory)|store this|log this)\\b/i.test(input);

  const rememberContent = (() => {
    const mm = input.match(/remember this\\s*:\\s*([\\s\\S]+)/i);
    if (mm && mm[1]) return mm[1].trim();
    return input.trim();
  })();

  const meta = {
    used: {
      base: true,
      identity: Boolean(identity?.trim?.() ?? ""),
      soul: Boolean(soul?.trim?.() ?? ""),
      skill: selected_skill ? String(selected_skill) : null
    },
    recall: {
      memory_hit_count: memHits.length,
      memory_hits: memHits.map((h) => ({ path: h.rel, score: h.score }))
    },
    actions: wantRemember
      ? [
          {
            type: "suggest_memory_write",
            folder: "general",
            filename_hint: "remembered-note.md",
            content: rememberContent
          }
        ]
      : []
  };

  const system = parts.join("\\n");
  return { system, meta };
}`;

  src = src.slice(0, start) + replacement + src.slice(end);
}

function patchChatRouteToReturnContext() {
  const needle = `app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat"`;
  const routeStart = src.indexOf(needle);
  if (routeStart < 0) throw new Error("/chat route not found.");

  const routeCloseBraceIdx = findBlockEndFrom(src, routeStart);
  const parenCloseIdx = src.indexOf(");", routeCloseBraceIdx);
  if (parenCloseIdx < 0) throw new Error("Could not find route terminator `);` after /chat handler.");

  const routeEnd = parenCloseIdx + 2;
  let chunk = src.slice(routeStart, routeEnd);

  // 1) system prompt call -> destructure
  chunk = chunk.replace(
    /const\s+system\s*=\s*await\s+buildChatSystemPrompt\(/g,
    "const { system, meta } = await buildChatSystemPrompt("
  );

  // 2) If the old code referenced `system` already, fine. We just need `meta` to be returned.
  // Inject context into common return shapes in this route block.
  // a) reply.send({ ... })
  chunk = chunk.replace(/reply\.send\(\{\s*/g, "reply.send({ context: meta, ");

  // b) return { output: ... }
  chunk = chunk.replace(/return\s+\{\s*output\s*:/g, "return { context: meta, output:");

  // c) if there is a later `return reply.send(res);` we can wrap once.
  chunk = chunk.replace(/return\s+reply\.send\(\s*res\s*\)\s*;/g, "return reply.send({ context: meta, ...res });");

  src = src.slice(0, routeStart) + chunk + src.slice(routeEnd);
}

replaceBuildChatSystemPrompt();
patchChatRouteToReturnContext();

fs.writeFileSync(FILE, src, "utf8");
console.log("✅ Patched: buildChatSystemPrompt returns {system, meta}; /chat injects context: meta.");
