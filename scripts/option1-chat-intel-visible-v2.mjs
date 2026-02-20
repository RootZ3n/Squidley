import fs from "node:fs";

const FILE = "apps/api/src/server.ts";
let src = fs.readFileSync(FILE, "utf8");

function findBlockEndFrom(startIdx) {
  // Find the first "{" after startIdx, then walk until braces balance.
  const openIdx = src.indexOf("{", startIdx);
  if (openIdx < 0) throw new Error("Could not find opening { for block.");

  let i = openIdx;
  let depth = 0;
  let inStr = false;
  let strCh = "";
  let inTpl = false;
  let inLine = false;
  let inBlock = false;
  let esc = false;

  for (; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];

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
      if (c === "`") {
        inTpl = false;
      }
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
      if (depth === 0) return i; // index of the closing "}"
    }
  }

  throw new Error("Unbalanced braces; could not find end of block.");
}

function patchBuildChatSystemPrompt() {
  const fnStart = src.indexOf("async function buildChatSystemPrompt(");
  if (fnStart < 0) throw new Error("buildChatSystemPrompt() not found in server.ts");

  const fnCloseBraceIdx = findBlockEndFrom(fnStart);
  const fnEnd = fnCloseBraceIdx + 1;

  let fn = src.slice(fnStart, fnEnd);

  // already patched?
  if (fn.includes("return { system, meta }")) return;

  const retNeedle = `  return parts.join("\\n");`;
  if (!fn.includes(retNeedle)) {
    throw new Error('Expected `return parts.join("\\n");` not found inside buildChatSystemPrompt().');
  }

  const replacement = `
  const system = parts.join("\\n");

  // ---- Option 1: Intelligence-visible context ----
  const inputRaw = String(args?.input ?? "");
  const wantRemember =
    /\\b(remember this|save this|add to (long\\s*term|memory)|store this|log this)\\b/i.test(inputRaw);

  // If user says "Remember this: <content>", capture the content deterministically.
  const rememberContent = (() => {
    const m = inputRaw.match(/remember this\\s*:\\s*([\\s\\S]+)/i);
    if (m && m[1]) return m[1].trim();
    return inputRaw.trim();
  })();

  const meta = {
    used: {
      base: true,
      identity: Boolean(identity?.trim()),
      soul: Boolean(soul?.trim()),
      skill: args.selected_skill ? String(args.selected_skill) : null
    },
    recall: {
      memory_hit_count: memHits.length,
      memory_hits: memHits.map(h => ({ path: h.rel, score: h.score }))
    },
    actions: wantRemember
      ? [{
          type: "suggest_memory_write",
          folder: "general",
          filename_hint: "remembered-note.md",
          content: rememberContent
        }]
      : []
  };

  return { system, meta };
`.trimEnd();

  fn = fn.replace(retNeedle, replacement);

  src = src.slice(0, fnStart) + fn + src.slice(fnEnd);
}

function patchChatRoute() {
  const routeNeedle = `app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat"`;
  const routeStart = src.indexOf(routeNeedle);
  if (routeStart < 0) throw new Error('/chat route not found');

  const routeCloseBraceIdx = findBlockEndFrom(routeStart); // closes the handler function body
  // After that brace, Fastify route typically continues with `);`
  const after = src.slice(routeCloseBraceIdx, routeCloseBraceIdx + 10);
  const parenCloseIdx = src.indexOf(");", routeCloseBraceIdx);
  if (parenCloseIdx < 0) throw new Error("Could not find route terminator `);` after /chat handler.");

  const routeEnd = parenCloseIdx + 2;
  let chunk = src.slice(routeStart, routeEnd);

  // Ensure /chat destructures {system, meta}
  const exactNeedle = `  const system = await buildChatSystemPrompt({
    input,
    selected_skill: selectedSkill
  });`;

  if (chunk.includes(exactNeedle)) {
    chunk = chunk.replace(
      exactNeedle,
      `  const { system, meta } = await buildChatSystemPrompt({
    input,
    selected_skill: selectedSkill
  });`
    );
  } else {
    const re = /const\s+system\s*=\s*await\s+buildChatSystemPrompt\(/;
    if (re.test(chunk)) {
      chunk = chunk.replace(re, "const { system, meta } = await buildChatSystemPrompt(");
    } else {
      // If it already destructures, fine.
      if (!/const\s+\{\s*system\s*,\s*meta\s*\}\s*=\s*await\s+buildChatSystemPrompt\(/.test(chunk)) {
        throw new Error("Could not find a buildChatSystemPrompt call in /chat to patch.");
      }
    }
  }

  // Inject context into the main success response objects.
  // We only do a safe, minimal injection: if we see `return {` blocks, add `context: meta,` right after.
  // (Doesn't touch error returns.)
  chunk = chunk.replace(/return\s+\{\s*\n/g, (m) => m + "      context: meta,\n");

  // Also: if there is a `return reply.send({`, inject context
  chunk = chunk.replace(/return\s+reply\.send\(\{\s*\n/g, (m) => m + "      context: meta,\n");

  src = src.slice(0, routeStart) + chunk + src.slice(routeEnd);
}

patchBuildChatSystemPrompt();
patchChatRoute();

fs.writeFileSync(FILE, src, "utf8");
console.log("✅ Patched: buildChatSystemPrompt returns {system,meta}; /chat responses include context meta + remember-actions.");
