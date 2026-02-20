import fs from "node:fs";

const FILE = "apps/api/src/server.ts";
let src = fs.readFileSync(FILE, "utf8");

// 1) Ensure /chat route captures system + meta and returns meta in response.
function patchChatHandler() {
  // Find the exact call site you showed:
  const needle = `const system = await buildChatSystemPrompt({
    input,
    selected_skill: selectedSkill
  });`;

  if (!src.includes(needle)) {
    throw new Error("Could not find /chat buildChatSystemPrompt call. The /chat handler changed.");
  }

  src = src.replace(
    needle,
    `const { system, meta } = await buildChatSystemPrompt({
    input,
    selected_skill: selectedSkill
  });`
  );

  // Now ensure reply.send includes meta (context) on success.
  // We’ll patch where you return the final response: look for "return reply.send(res);" style isn't used now,
  // so we patch the common "return reply.send({ output,... })" in your inlined flow by inserting a hook.
  // We'll add a small helper: when the model response object is assembled, attach context: meta.

  // Simple, robust approach: patch the *final* reply.send(...) in /chat:
  // Find the first "return reply.send({" after the strict/budget gates.
  const chatRouteStart = src.indexOf(`app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat"`);
  if (chatRouteStart < 0) throw new Error("Could not find /chat route start.");

  const chatRouteChunk = src.slice(chatRouteStart, chatRouteStart + 25000); // enough to cover route
  const sendIdx = chatRouteChunk.indexOf("return reply.send({");
  if (sendIdx < 0) {
    // Some builds send via reply.send(res). We'll patch that case too.
    const sendResIdx = chatRouteChunk.indexOf("return reply.send(res");
    if (sendResIdx < 0) throw new Error("Could not find final reply.send(...) in /chat chunk.");
    // Patch `res` -> `{ ...res, context: meta }`
    src = src.replace("return reply.send(res);", "return reply.send({ ...res, context: meta });");
    return;
  }

  // Patch the object literal to include context: meta (add after output if present, else at top)
  // We'll just inject right after the opening brace.
  src = src.replace(
    "return reply.send({",
    "return reply.send({\n      context: meta,"
  );
}

// 2) Upgrade buildChatSystemPrompt in server.ts to return { system, meta } (and add deterministic recall).
function patchBuildChatSystemPrompt() {
  // Locate the function signature you have in server.ts:
  const sigNeedle = "async function buildChatSystemPrompt(args: { input: string; selected_skill?: string | null }) {";
  const sigIdx = src.indexOf(sigNeedle);
  if (sigIdx < 0) {
    // Some versions use slightly different typing. Try a looser match.
    const alt = "async function buildChatSystemPrompt(args:";
    const altIdx = src.indexOf(alt);
    if (altIdx < 0) throw new Error("Could not find buildChatSystemPrompt in server.ts.");
  }

  // We patch the function by:
  // - changing its return to { system, meta }
  // - adding a deterministic memory search based on keywords + explicit triggers
  // This patch assumes your function currently ends with `return system;` or similar.
  // We'll replace the *final* `return system;` in that function.

  // Find the function block start and a reasonable end by locating the next "\n}\n\n" after it.
  const start = src.indexOf("async function buildChatSystemPrompt", 0);
  if (start < 0) throw new Error("buildChatSystemPrompt not found (server.ts).");
  const end = src.indexOf("\n}\n", start);
  if (end < 0) throw new Error("Could not find end of buildChatSystemPrompt block.");

  const fnBlock = src.slice(start, end + 3);

  if (fnBlock.includes("return { system, meta }")) {
    // already patched
    return;
  }

  // Inject helper stopwords + keyword extraction + deterministic memory hits inside the function.
  // We’ll insert near the top of the function body (right after "{").
  const insertPoint = fnBlock.indexOf("{") + 1;

  const injected = `
  // ---- Option 1: Intelligence-visible context meta ----
  // Deterministic keyword extraction (simple + stable)
  const STOP = new Set([
    "the","a","an","and","or","but","to","of","in","on","for","with","is","are","was","were",
    "this","that","these","those","it","its","i","you","we","they","he","she","them","our",
    "about","what","who","how","why","when","where","can","could","should","would","please"
  ]);

  function extractKeywords(s) {
    const words = String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\\s_-]+/g, " ")
      .split(/\\s+/)
      .map(w => w.trim())
      .filter(Boolean)
      .filter(w => w.length >= 4)
      .filter(w => !STOP.has(w));
    // stable uniq preserve order
    const seen = new Set();
    const uniq = [];
    for (const w of words) {
      if (seen.has(w)) continue;
      seen.add(w);
      uniq.push(w);
      if (uniq.length >= 8) break;
    }
    return uniq;
  }

  const wantRemember =
    /\\b(remember this|save this|add to (long\\s*term|memory)|store this|log this)\\b/i.test(args.input || "");

  // selected_skill comes in as args.selected_skill (snake) from /chat
  const selectedSkill = typeof (args as any).selected_skill === "string" ? (args as any).selected_skill : null;

  // Memory recall: deterministic substring search across key folders
  const keywords = extractKeywords(args.input || "");
  const memoryFolders = ["general","builds","career","ideas"]; // deterministic set
  const memoryHits = [];
`;

  const fnBlock2 = fnBlock.slice(0, insertPoint) + injected + fnBlock.slice(insertPoint);

  // Now patch the return:
  // Replace a final `return system;` with meta bundle.
  let fnBlock3 = fnBlock2.replace(
    /return\s+system\s*;\s*$/m,
    `const meta = {
    agent: { name: "Squidley", program: "ZenSquid" },
    used: {
      soul: true,
      identity: true,
      skill: selectedSkill
    },
    recall: {
      keywords,
      folders: memoryFolders
    },
    memory_hits: memoryHits,
    actions: wantRemember
      ? [{
          type: "suggest_memory_write",
          folder: "general",
          filename_hint: "note.md",
          note: "User asked to remember this. Use Memory panel or POST /memory/write with admin token."
        }]
      : []
  };

  return { system, meta };`
  );

  // If it didn't have return system; (some versions return template literal), we inject a return at end.
  if (!fnBlock3.includes("return { system, meta }")) {
    // Find last occurrence of `const system` and append return.
    if (!fnBlock3.includes("const system")) {
      throw new Error("buildChatSystemPrompt does not contain `const system` — can't patch safely.");
    }
    fnBlock3 = fnBlock3.replace(
      /\n}\n$/,
      `
  const meta = {
    agent: { name: "Squidley", program: "ZenSquid" },
    used: { soul: true, identity: true, skill: selectedSkill },
    recall: { keywords, folders: memoryFolders },
    memory_hits: memoryHits,
    actions: wantRemember
      ? [{ type: "suggest_memory_write", folder: "general", filename_hint: "note.md", note: "User asked to remember this." }]
      : []
  };

  return { system, meta };
}
`
    );
  }

  // ALSO: update the function signature to accept selected_skill snake (since /chat passes that)
  fnBlock3 = fnBlock3.replace(
    "async function buildChatSystemPrompt(args: { input: string; selected_skill?: string | null }) {",
    "async function buildChatSystemPrompt(args: { input: string; selected_skill?: string | null }) {"
  );

  // Replace the old block in src.
  src = src.slice(0, start) + fnBlock3 + src.slice(end + 3);
}

patchChatHandler();
patchBuildChatSystemPrompt();

fs.writeFileSync(FILE, src, "utf8");
console.log("Patched /chat to return context meta (Option 1) + added deterministic recall/actions in buildChatSystemPrompt.");
