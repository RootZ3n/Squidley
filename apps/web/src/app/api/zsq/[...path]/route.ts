// apps/web/src/app/api/zsq/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";

function apiBase(): string {
  // Server-only env var for the API base
  return process.env.ZENSQUID_API_BASE ?? process.env.NEXT_PUBLIC_ZENSQUID_API_BASE ?? "http://127.0.0.1:18790";
}

function joinUrl(base: string, p: string): string {
  const b = base.replace(/\/+$/, "");
  const path = p.replace(/^\/+/, "");
  return `${b}/${path}`;
}

const ALLOW_GET_PREFIXES = [
  "health",
  "snapshot",
  "doctor",
  "receipts",
  "budgets",
  "runtime",
  "chat" // allow GET if you ever add it; harmless
];

// POST allowlist (UI toggles + chat)
const ALLOW_POST_EXACT = new Set([
  "chat",
  "budgets/strict_local_only",
  "runtime/safety_zone"
]);

function isAllowedGet(path: string) {
  return ALLOW_GET_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"));
}

function isAllowedPost(path: string) {
  // allow "receipts?..." via GET only; POST only for exact allowlist
  const clean = path.split("?")[0];
  return ALLOW_POST_EXACT.has(clean);
}

function shouldAttachAdminToken(path: string, method: string) {
  if (method !== "POST") return false;
  const clean = path.split("?")[0];
  return clean === "budgets/strict_local_only" || clean === "runtime/safety_zone";
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const p = pathParts.join("/");
  const method = req.method.toUpperCase();

  if (method === "GET") {
    if (!isAllowedGet(p)) {
      return NextResponse.json({ ok: false, error: "Blocked path (GET)", path: p }, { status: 403 });
    }
  } else if (method === "POST") {
    if (!isAllowedPost(p)) {
      return NextResponse.json({ ok: false, error: "Blocked path (POST)", path: p }, { status: 403 });
    }
  } else {
    return NextResponse.json({ ok: false, error: "Method not allowed", method }, { status: 405 });
  }

  const target = joinUrl(apiBase(), p);
  const headers = new Headers(req.headers);

  // Don’t forward browser host/origin junk as authority
  headers.delete("host");

  // If UI is toggling runtime/budget, the server injects the admin token (never expose it to browser).
  if (shouldAttachAdminToken(p, method)) {
    const token = process.env.ZENSQUID_ADMIN_TOKEN ?? "";
    if (!token || token.trim().length < 12) {
      return NextResponse.json(
        { ok: false, error: "Server missing ZENSQUID_ADMIN_TOKEN (refusing admin proxy)" },
        { status: 500 }
      );
    }
    headers.set("x-zensquid-admin-token", token);
  }

  let body: string | undefined = undefined;
  if (method === "POST") {
    // Pass JSON through
    body = await req.text();
    if (!headers.get("content-type")) headers.set("content-type", "application/json");
  }

  const r = await fetch(target, {
    method,
    headers,
    body
  });

  const text = await r.text();
  const contentType = r.headers.get("content-type") ?? "";

  // Return JSON when possible (nice DX)
  if (contentType.includes("application/json")) {
    try {
      return NextResponse.json(JSON.parse(text), { status: r.status });
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON from API", raw: text }, { status: 502 });
    }
  }

  return new NextResponse(text, { status: r.status, headers: { "content-type": contentType || "text/plain" } });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
