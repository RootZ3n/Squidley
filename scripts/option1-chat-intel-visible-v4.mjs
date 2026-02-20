import fs from "node:fs";

const FILE = "apps/api/src/server.ts";
let src = fs.readFileSync(FILE, "utf8");

function findBlockEndFrom(startIdx) {
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
      if (depth === 0) return i; // index of closing "}"
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

  // If already patched to return { system, meta }, do nothing
  if (fn.includes("return { system, meta }") || fn.includes("return {system, meta}")) return;

  // Find the LAST return statement in the function
  const returnRe = /return\s+([\s\S]*?);?\s*$/gm;
  let last = null;
  for (;;) {
    const m = returnRe.exec(fn);
    if (!m) break;
    last = m;
  }
  if (!last) throw new Error("No return statement found inside buildChatSystemPrompt().");

  const returnExpr = (last[1] ?? "").trim();
  if (!returnExpr) throw new Error("Return expression was empty inside buildChatSystemPrompt().");

  // Build meta + actions + replace last return
  const metaBlock = `
  // ---- Option 1: Intelligence-visible context ----
  const inputRaw = String(args?.input ?? "");
  const wantRemember =
    /\\b(remember this|save this|add to (long\\s*term|memory)|store this|log this)\\b/i.test(inputRaw);

  // If user says "Remember this: <content>", capture deterministically; else store whole input.
  const rememberContent = (() => {
    const mm = inputRaw.match(/remember this\\s*:\\s*([\\s\\S]+)/i);
    if (mm && mm[1]) return mm[1].trim();
    return inputRaw.trim();
  })();

  const meta = {
    used: {
      base: true,
      identity: Boolean(identity?.trim?.() ?? identity?.trim()),
      soul: Boolean(soul?.trim?.() ?? soul?.trim()),
      skill: args.selected_skill ? String(args.selected_skill) : null
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

  const system = (${returnExpr});
  return { system, meta };
`.trimEnd();

  // Replace ONLY the last return statement match
  const before = fn.slice(0, last.index);
  const after = fn.slice(last.index + last[0].length);
  fn = before + metaBlock + after;

  src = src.slice(0, fnStart) + fn + src.slice(fnEnd);
}

function patchChatRoute() {
  const needle = `app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat"`;
  const routeStart = src.indexOf(needle);
  if (routeStart < 0) throw new Error("/chat route not found");

  const routeCloseBraceIdx = findBlockEndFrom(routeStart);
  const parenCloseIdx = src.indexOf(");", routeCloseBraceIdx);
  if (parenCloseIdx < 0) throw new Error("Could not find route terminator `);` after /chat handler.");

  const routeEnd = parenCloseIdx + 2;
  let chunk = src.slice(routeStart, routeEnd);

  // Ensure buildChatSystemPrompt is destructured
  chunk = chunk.replace(
    /const\s+system\s*=\s*await\s+buildChatSystemPrompt\(/g,
    "const { system, meta } = await buildChatSystemPrompt("
  );

  // If it already has { system, meta }, fine. If it has { system } only, upgrade it.
  chunk = chunk.replace(
    /const\s+\{\s*system\s*\}\s*=\s*await\s+buildChatSystemPrompt\(/g,
    "const { system, meta } = await buildChatSystemPrompt("
  );

  if (!/const\s+\{\s*system\s*,\s*meta\s*\}\s*=\s*await\s+buildChatSystemPrompt\(/.test(chunk)) {
    throw new Error("Could not patch /chat to use `const { system, meta } = await buildChatSystemPrompt(...)`.");
  }

  // Add context: meta to successful response objects (those that return output)
  chunk = chunk.replace(
    /return\s+\{\s*\n(\s*)output\s*:/g,
    (m, indent) => `return {\n${indent}context: meta,\n${indent}output:`
  );

  // Also handle reply.send({ output: ... })
  chunk = chunk.replace(
    /reply\.send\(\{\s*\n(\s*)output\s*:/g,
    (m, indent) => `reply.send({\n${indent}context: meta,\n${indent}output:`
  );

  src = src.slice(0, routeStart) + chunk + src.slice(routeEnd);
}

patchBuildChatSystemPrompt();
patchChatRoute();

fs.writeFileSync(FILE, src, "utf8");
console.log("✅ Patched: buildChatSystemPrompt now returns {system, meta}; /chat responses include context meta.");
