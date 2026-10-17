import { NextRequest } from "next/server";

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
