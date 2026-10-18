import { NextRequest } from "next/server";

import { describeApiAction } from "@/lib/server/api-actions";
import { errorFields, getLogger, type LogLevel } from "@/lib/server/logger";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const MAX_REDIRECTS = 3;
// Same header and id format as the backend, so one id finds the lines of both services.
const REQUEST_ID_HEADER = "x-request-id";
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;
const FEED_TOKEN = /(\/calendar\/feed\/)[^/]+?(\.ics)/;

const accessLogger = getLogger("web.proxy");
const actionLogger = getLogger("web.action");

function requestId(request: NextRequest): string {
  const incoming = request.headers.get(REQUEST_ID_HEADER) ?? "";
  return VALID_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

// The token is verified by the backend; here it only labels log lines with who acted.
function userIdFromToken(authorization: string | null): number | undefined {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const payload = token?.split(".")[1];
  if (!payload) return undefined;
  try {
    const sub = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).sub;
    return /^\d+$/.test(String(sub)) ? Number(sub) : undefined;
  } catch {
    return undefined;
  }
}

function levelFor(status: number, fallback: LogLevel): LogLevel {
  if (status >= 500) return "ERROR";
  if (status >= 400) return "WARNING";
  return fallback;
}

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const started = performance.now();
  const id = requestId(request);
  const action = describeApiAction(request.method, path);
  const logPath = `/api/v1/${path.join("/")}`.replace(FEED_TOKEN, "$1***$2");
  const baseFields = {
    request_id: id,
    user_id: userIdFromToken(request.headers.get("authorization")),
    method: request.method,
    path: logPath,
  };

  const headers: Record<string, string> = { [REQUEST_ID_HEADER]: id };
  const contentType = request.headers.get("content-type");
  const authorization = request.headers.get("authorization");
  if (contentType) headers["content-type"] = contentType;
  if (authorization) headers["authorization"] = authorization;

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody
    ? new Uint8Array(await request.arrayBuffer()).slice()
    : undefined;

  if (action?.external) {
    actionLogger.info(`${action.event} started`, {
      ...baseFields,
      ...action.ids,
      event: action.event,
      external: action.external,
      size_bytes: body?.byteLength,
    });
  }

  const apiOrigin = new URL(API_URL).origin;
  let url = `${API_URL}/api/v1/${path.join("/")}${request.nextUrl.search}`;
  let upstream: Response;
  try {
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
  } catch (error) {
    accessLogger.error("backend unreachable", {
      ...baseFields,
      ...errorFields(error),
      event: action?.event,
      status: 502,
      duration_ms: Math.round(performance.now() - started),
    });
    return Response.json(
      { detail: "Backend unavailable" },
      { status: 502, headers: { [REQUEST_ID_HEADER]: id } },
    );
  }

  const responseBody = await upstream.arrayBuffer();
  const fields = {
    ...baseFields,
    status: upstream.status,
    duration_ms: Math.round(performance.now() - started),
  };
  if (action) {
    // Successful mutations are the business events; failed ones say why the user got an error.
    const ok = upstream.ok;
    actionLogger.log(levelFor(upstream.status, "INFO"), ok ? action.event : `${action.event} failed`, {
      ...fields,
      ...action.ids,
      event: action.event,
      external: action.external,
    });
  } else {
    accessLogger.log(
      levelFor(upstream.status, "DEBUG"),
      `${request.method} ${logPath} ${upstream.status}`,
      fields,
    );
  }

  return new Response(responseBody.byteLength > 0 ? responseBody : null, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      [REQUEST_ID_HEADER]: id,
    },
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
