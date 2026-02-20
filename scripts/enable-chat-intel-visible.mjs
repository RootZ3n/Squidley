// scripts/enable-chat-intel-visible.mjs
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

function insertAfter(haystack, needle, insert) {
  const idx = haystack.indexOf(needle);
  if (idx < 0) return null;
  return haystack.slice(0, idx + needle.length) + insert + haystack.slice(idx + needle.length);
}

function findChatRouteBlock(src) {
  const startNeedle = 'app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat"';
  const start = src.indexOf(startNeedle);
  if (start < 0) return null;

  // find the opening brace of the handler
  const braceOpen = src.indexOf("{", start);
  if (braceOpen < 0) return null;

  // naive brace matching from the first "{"
  let depth = 0;
  for (let i = braceOpen; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) {
      // i is the closing brace of the handler's function body,
      // but the route call ends with ");"
      const end = src.indexOf(");", i);
      if (end < 0) return null;
      return { start, end: end + 2, braceOpen };
    }
  }
  return null;
}

function ensureHelperInjected(src) {
  // If helper already present, do nothing
  if (src.includes("function buildChatContextVisible(")) {
    console.log("ℹ️ helper already present; skipping inject.");
    return src;
  }

  const builderNeedle = "async function buildChatSystemPrompt";
  const builderIdx = src.indexOf(builderNeedle);
  if (builderIdx < 0) die("Could not find buildChatSystemPrompt().");

  // Find end of that function by matching braces starting at its "{"
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
function extractRememberPayload(input) {
  const s = String(input ?? "").trim();
  // Prefer content after ":" if user wrote "Remember this: ..."
  const colonIdx = s.indexOf(":");
  if (colonIdx >= 0 && colonIdx < s.length - 1) return s.slice(colonIdx + 1).trim();
  // Otherwise remove the trigger phrase and keep the rest
  return s.replace(/\\b(remember this|save this|store this|add to (long\\s*term|memory)|log this)\\b\\s*[:\\-]?\\s*/i, "").trim();
}

async function buildChatContextVisible(args) {
  const input = String(args?.input ?? "");
  const selected_skill = args?.selected_skill ?? null;

  // These helpers already exist above in server.ts in your build:
  // - loadAgentTexts()
  // - searchMemoryForChat()
  // - loadSkillDoc()
  // - BASE_SYSTEM_PROMPT
  const { soul, identity } = await loadAgentTexts();
  const memHits = await searchMemoryForChat(input, 5);
  const skill = selected_skill ? await loadSkillDoc(selected_skill) : "";

  const used = {
    base: true,
    identity: Boolean(identity && identity.trim()),
    soul: Boolean(soul && soul.trim()),
    skill: selected_skill ? selected_skill : null
  };

  const wantRemember = /\\b(remember this|save this|store this|add to (long\\s*term|memory)|log this)\\b/i.test(input);
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

  const memory_hits = memHits.map((h) => ({
    path: h.rel,
    score: h.score
  }));

  // Build system string using your existing buildChatSystemPrompt (string-only)
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
  if (!blk) die('Could not find /chat route block. (Needle: app.post..."/chat")');

  const chatSrc = src.slice(blk.start, blk.end);

  if (chatSrc.includes("buildChatContextVisible(")) {
    console.log("ℹ️ /chat already uses buildChatContextVisible(); skipping route patch.");
    return src;
  }

  // Replace system builder call with ctx builder
  const systemNeedle = "const system = await buildChatSystemPrompt({";
  const sysIdx = chatSrc.indexOf(systemNeedle);
  if (sysIdx < 0) die("Could not find `const system = await buildChatSystemPrompt({` inside /chat route.");

  // Find the end of that call by scanning to the next ");" after sysIdx
  const sysCallEnd = chatSrc.indexOf(");", sysIdx);
  if (sysCallEnd < 0) die("Could not find end of buildChatSystemPrompt(...) call in /chat route.");

  const before = chatSrc.slice(0, sysIdx);
  const after = chatSrc.slice(sysCallEnd + 2);

  // We need selectedSkill variable name in route; your current route has `const selectedSkill = ...`
  // We'll use it directly.
  const replacement = `const ctx = await buildChatContextVisible({ input, selected_skill: selectedSkill });
  const system = ctx.system;`;

  let patched = before + replacement + after;

  // Attach context to final reply.send(...) payload.
  // Find the last "return reply.send(" inside chat route.
  const lastSend = patched.lastIndexOf("return reply.send(");
  if (lastSend < 0) {
    // some versions do reply.send(res) without return; try last "reply.send("
    const alt = patched.lastIndexOf("reply.send(");
    if (alt < 0) die("Could not find reply.send(...) inside /chat route.");
    // best-effort: wrap the res object just before send if it's `reply.send(res)`
  }

  // Try common pattern: `return reply.send(res);`
  // Replace only that final return line if present.
  patched = patched.replace(/return\\s+reply\\.send\\(res\\)\\s*;\\s*$/m, "return reply.send({ ...res, context: ctx.meta });");

  // If it didn't match, try `return reply.send(res);` in-line
  if (!patched.includes("context: ctx.meta")) {
    patched = patched.replace(/return\\s+reply\\.send\\(res\\);/g, "return reply.send({ ...res, context: ctx.meta });");
  }

  // Still nothing? fallback: replace first `reply.send(res)` occurrences
  if (!patched.includes("context: ctx.meta")) {
    patched = patched.replace(/reply\\.send\\(res\\)/g, "reply.send({ ...res, context: ctx.meta })");
  }

  if (!patched.includes("context: ctx.meta")) {
    die("Patched /chat, but could not attach context to response (no reply.send(res) found).");
  }

  const out = src.slice(0, blk.start) + patched + src.slice(blk.end);
  console.log("✅ patched /chat route to include context.");
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
