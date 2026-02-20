// scripts/enable-chat-intel-visible-v2.mjs
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SERVER = path.join(ROOT, "apps/api/src/server.ts");

function die(msg) {
  console.error("❌ " + msg);
  process.exit(2);
}

function backupFile(p) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const bak = `${p}.bak.${ts}`;
  fs.copyFileSync(p, bak);
  console.log("✅ backup:", bak);
}

function findChatRouteBlock(src) {
  const startNeedle =
    'app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat"';
  const start = src.indexOf(startNeedle);
  if (start < 0) return null;

  const braceOpen = src.indexOf("{", start);
  if (braceOpen < 0) return null;

  let depth = 0;
  for (let i = braceOpen; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) {
      const end = src.indexOf(");", i);
      if (end < 0) return null;
      return { start, end: end + 2, braceOpen };
    }
  }
  return null;
}

function ensureHelperInjected(src) {
  if (src.includes("function buildChatContextVisible(")) {
    console.log("ℹ️ buildChatContextVisible() already present; skipping inject.");
    return src;
  }

  const builderNeedle = "async function buildChatSystemPrompt";
  const builderIdx = src.indexOf(builderNeedle);
  if (builderIdx < 0) die("Could not find buildChatSystemPrompt().");

  const fnOpen = src.indexOf("{", builderIdx);
  if (fnOpen < 0) die("Could not find buildChatSystemPrompt() brace.");

  let depth = 0;
  let fnClose = -1;
  for (let i = fnOpen; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    if (depth === 0) {
      fnClose = i;
      break;
    }
  }
  if (fnClose < 0) die("Could not find end of buildChatSystemPrompt() block.");

  const injectAt = fnClose + 1;

  const helper = `

/**
 * Option 1: "Intelligence Visible" context
 * - Returns { system, meta } where system is the system prompt string
 * - meta includes which sources were used, memory hits, and suggested actions (no auto-writes)
 */
function extractRememberPayload(input: string) {
  const s = String(input ?? "").trim();
  const colonIdx = s.indexOf(":");
  if (colonIdx >= 0 && colonIdx < s.length - 1) return s.slice(colonIdx + 1).trim();
  return s
    .replace(/\\b(remember this|save this|store this|add to (long\\s*term|memory)|log this)\\b\\s*[:\\-]?\\s*/i, "")
    .trim();
}

async function buildChatContextVisible(args: { input: string; selected_skill?: string | null }) {
  const input = String(args?.input ?? "");
  const selected_skill = args?.selected_skill ?? null;

  const { soul, identity } = await loadAgentTexts();
  const memHits = await searchMemoryForChat(input, 5);
  const skill = selected_skill ? await loadSkillDoc(selected_skill) : "";

  const used = {
    base: true,
    identity: Boolean(identity && identity.trim()),
    soul: Boolean(soul && soul.trim()),
    skill: selected_skill ? selected_skill : null
  };

  const wantRemember =
    /\\b(remember this|save this|store this|add to (long\\s*term|memory)|log this)\\b/i.test(input);
  const rememberContent = wantRemember ? extractRememberPayload(input) : "";

  const actions = wantRemember
    ? [
        {
          type: "suggest_memory_write",
          folder: "general",
          filename_hint: "remembered-note.md",
          content: rememberContent || input
        }
      ]
    : [];

  const memory_hits = memHits.map((h: any) => ({
    path: h.rel,
    score: h.score
  }));

  const system = await buildChatSystemPrompt({
    input,
    selected_skill
  });

  const meta = {
    used,
    recall: {
      memory_hit_count: memHits.length,
      memory_hits
    },
    actions
  };

  return { system, meta };
}
`;

  const out = src.slice(0, injectAt) + helper + src.slice(injectAt);
  console.log("✅ injected buildChatContextVisible() helper.");
  return out;
}

function patchChatRoute(src) {
  const blk = findChatRouteBlock(src);
  if (!blk) die('Could not find /chat route block.');

  let chatSrc = src.slice(blk.start, blk.end);

  if (chatSrc.includes("buildChatContextVisible(") && chatSrc.includes("context:")) {
    console.log("ℹ️ /chat already patched for intelligence-visible context; skipping.");
    return src;
  }

  // 1) Ensure we compute ctx+system and stop using any direct buildChatSystemPrompt result assigned to `system`.
  // Remove any line like: const system = await buildChatSystemPrompt(...);
  chatSrc = chatSrc.replace(
    /^\s*const\s+system\s*=\s*await\s+buildChatSystemPrompt\s*\([\s\S]*?\);\s*$/m,
    ""
  );

  // Find a good insertion point: after `const selectedSkill = ...` OR after `const input = ...`
  let insertAt = chatSrc.search(/^\s*const\s+selectedSkill\s*=.*$/m);
  if (insertAt < 0) insertAt = chatSrc.search(/^\s*const\s+input\s*=.*$/m);
  if (insertAt < 0) die("Could not find const selectedSkill or const input in /chat route.");

  // Insert ctx builder right after that line.
  const lines = chatSrc.split("\n");
  let inserted = false;
  for (let i = 0; i < lines.length; i++) {
    if (
      !inserted &&
      (lines[i].match(/^\s*const\s+selectedSkill\s*=/) || lines[i].match(/^\s*const\s+input\s*=/))
    ) {
      // insert AFTER this line
      lines.splice(
        i + 1,
        0,
        "",
        "  const ctx = await buildChatContextVisible({ input, selected_skill: selectedSkill });",
        "  const system = ctx.system;",
        ""
      );
      inserted = true;
      break;
    }
  }
  if (!inserted) die("Failed inserting ctx/system lines in /chat route.");

  chatSrc = lines.join("\n");

  // 2) Attach context to response.
  // Prefer injecting into object literal send: return reply.send({ ... })
  if (/return\s+reply\.send\(\s*\{\s*/.test(chatSrc)) {
    chatSrc = chatSrc.replace(
      /return\s+reply\.send\(\s*\{\s*/,
      "return reply.send({ context: ctx.meta, "
    );
  } else if (/reply\.send\(\s*\{\s*/.test(chatSrc)) {
    chatSrc = chatSrc.replace(/reply\.send\(\s*\{\s*/, "reply.send({ context: ctx.meta, ");
  } else if (/return\s+reply\.send\(\s*res\s*\)/.test(chatSrc)) {
    chatSrc = chatSrc.replace(
      /return\s+reply\.send\(\s*res\s*\)\s*;/,
      "return reply.send({ ...res, context: ctx.meta });"
    );
  } else if (/reply\.send\(\s*res\s*\)/.test(chatSrc)) {
    chatSrc = chatSrc.replace(/reply\.send\(\s*res\s*\)/, "reply.send({ ...res, context: ctx.meta })");
  } else {
    die("Could not find reply.send(...) shape to inject context.");
  }

  // 3) Make sure ctx exists if we injected context
  if (!chatSrc.includes("const ctx = await buildChatContextVisible")) {
    die("ctx injection missing after patch (unexpected).");
  }
  if (!chatSrc.includes("context: ctx.meta")) {
    die("context injection missing after patch (unexpected).");
  }

  const out = src.slice(0, blk.start) + chatSrc + src.slice(blk.end);
  console.log("✅ patched /chat route to include ctx.system + context meta.");
  return out;
}

function main() {
  if (!fs.existsSync(SERVER)) die("server.ts not found at " + SERVER);
  backupFile(SERVER);

  let src = fs.readFileSync(SERVER, "utf8");
  src = ensureHelperInjected(src);
  src = patchChatRoute(src);

  fs.writeFileSync(SERVER, src, "utf8");
  console.log("✅ Done. Now run: pnpm -C apps/api build && systemctl --user restart zensquid-api.service");
}

main();
