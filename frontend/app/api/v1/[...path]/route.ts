import { NextRequest } from "next/server";

// Proxies /api/v1/* to the backend. API_URL is read at runtime, so the same image
// works in any environment (inside docker compose it is http://api:8000).
const API_URL = process.env.API_URL ?? "http://localhost:8000";
const MAX_REDIRECTS = 3;

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;

  const headers: Record<string, string> = {};
  const contentType = request.headers.get("content-type");
  const authorization = request.headers.get("authorization");
  if (contentType) headers["content-type"] = contentType;
  if (authorization) headers["authorization"] = authorization;

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  // Keep a private copy of the body so it can be sent again after an internal
  // redirect (FastAPI redirects /pets -> /pets/). Passing the request buffer
  // directly to fetch fails: undici detaches it after the first send.
  const body = hasBody
    ? new Uint8Array(await request.arrayBuffer()).slice()
    : undefined;

  const apiOrigin = new URL(API_URL).origin;
  let url = `${API_URL}/api/v1/${path.join("/")}${request.nextUrl.search}`;
  let upstream: Response;
  for (let hop = 0; ; hop += 1) {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body: body ? body.slice() : undefined,
      redirect: "manual",
      cache: "no-store",
    });

    const location = upstream.headers.get("location");
    if (!location || upstream.status < 300 || upstream.status >= 400 || hop >= MAX_REDIRECTS) {
      break;
    }
    const next = new URL(location, API_URL);
    if (next.origin !== apiOrigin) break;
    url = next.toString();
  }

  const responseBody = await upstream.arrayBuffer();
  return new Response(responseBody.byteLength > 0 ? responseBody : null, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
