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

function patchBuildChatSystemPrompt() {
  const fnStart = src.indexOf("async function buildChatSystemPrompt(");
  if (fnStart < 0) throw new Error("buildChatSystemPrompt() not found.");

  const fnCloseBraceIdx = findBlockEndFrom(src, fnStart);
  const fnEnd = fnCloseBraceIdx + 1;
  let fn = src.slice(fnStart, fnEnd);

  // already patched?
  if (fn.includes("return { system, meta }")) return;

  // accept either return parts.join("\n") OR return parts.join('\\n') etc
  const returnRe = /return\s+parts\.join\(\s*(['"])(\\n|\n)\1\s*\)\s*;/m;
  const m = fn.match(returnRe);
  if (!m) {
    throw new Error('Expected a line like `return parts.join("\\n");` or `return parts.join("\\n");` not found inside buildChatSystemPrompt().');
  }

  const inject = `
  // ---- Option 1: Intelligence-visible context ----
  const inputRaw = String(args?.input ?? "");

  const wantRemember =
    /\\b(remember this|save this|add to (long\\s*term|memory)|store this|log this)\\b/i.test(inputRaw);

  const rememberContent = (() => {
    const mm = inputRaw.match(/remember this\\s*:\\s*([\\s\\S]+)/i);
    if (mm && mm[1]) return mm[1].trim();
    return inputRaw.trim();
  })();

  const meta = {
    used: {
      base: true,
      identity: Boolean(identity?.trim?.() ?? identity?.trim?.()),
      soul: Boolean(soul?.trim?.() ?? soul?.trim?.()),
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

  const system = parts.join("\\n");
  return { system, meta };
`.trim();

  fn = fn.replace(returnRe, inject);

  src = src.slice(0, fnStart) + fn + src.slice(fnEnd);
}

function patchChatRoute() {
  const needle = `app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat"`;
  const routeStart = src.indexOf(needle);
  if (routeStart < 0) throw new Error("/chat route not found.");

  const routeCloseBraceIdx = findBlockEndFrom(src, routeStart);
  const parenCloseIdx = src.indexOf(");", routeCloseBraceIdx);
  if (parenCloseIdx < 0) throw new Error("Could not find route terminator `);` after /chat handler.");

  const routeEnd = parenCloseIdx + 2;
  let chunk = src.slice(routeStart, routeEnd);

  chunk = chunk.replace(
    /const\s+system\s*=\s*await\s+buildChatSystemPrompt\(/g,
    "const { system, meta } = await buildChatSystemPrompt("
  );

  // inject context into reply.send({ ... }) inside /chat only
  chunk = chunk.replace(/reply\.send\(\{\s*/g, "reply.send({ context: meta, ");

  // and handle plain return object forms
  chunk = chunk.replace(/return\s+\{\s*output\s*:/g, "return { context: meta, output:");

  src = src.slice(0, routeStart) + chunk + src.slice(routeEnd);
}

patchBuildChatSystemPrompt();
patchChatRoute();

fs.writeFileSync(FILE, src, "utf8");
console.log("✅ Patched: buildChatSystemPrompt returns {system, meta}; /chat injects context.");
