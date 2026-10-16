import { NextRequest } from "next/server";

// Proxies /api/v1/* to the backend. API_URL is read at runtime, so the same image
// works in any environment (inside docker compose it is http://api:8000).
const API_URL = process.env.API_URL ?? "http://localhost:8000";

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = `${API_URL}/api/v1/${path.join("/")}${request.nextUrl.search}`;

  const headers: Record<string, string> = {};
  const contentType = request.headers.get("content-type");
  const authorization = request.headers.get("authorization");
  if (contentType) headers["content-type"] = contentType;
  if (authorization) headers["authorization"] = authorization;

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  // Forward raw bytes so multipart uploads (photos) keep their boundary and binary
  // data. Copy into a Buffer: passing the request ArrayBuffer straight to fetch
  // fails because the runtime detaches it ("detached ArrayBuffer").
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? Buffer.from(await request.arrayBuffer()) : undefined,
    cache: "no-store",
  });

  const body = await upstream.arrayBuffer();
  return new Response(body.byteLength > 0 ? body : null, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
