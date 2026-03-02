export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = (process.env.ZENSQUID_API_URL || "http://127.0.0.1:18790").replace(/\/+$/, "");

function stripHopByHopHeaders(headers: Headers) {
  const hopByHop = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
  ]);
  for (const k of Array.from(headers.keys())) {
    if (hopByHop.has(k.toLowerCase())) headers.delete(k);
  }
}

async function proxy(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  const url = new URL(req.url);
  const target = `${API_BASE}/${path.map(encodeURIComponent).join("/")}${url.search}`;

  const headers = new Headers(req.headers);
  stripHopByHopHeaders(headers);

  const method = req.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();

  const upstream = await fetch(target, {
    method,
    headers,
    body: body ? Buffer.from(body) : undefined,
    redirect: "manual",
  });

  const outHeaders = new Headers(upstream.headers);
  stripHopByHopHeaders(outHeaders);

  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
