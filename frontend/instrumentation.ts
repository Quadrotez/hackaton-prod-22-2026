import type { Instrumentation } from "next";

import { errorFields, getLogger } from "@/lib/server/logger";

const logger = getLogger("web.server");

export function register() {
  logger.info("frontend started", {
    node_env: process.env.NODE_ENV,
    api_url: process.env.API_URL ?? "http://localhost:8000",
  });
}

// Unhandled errors in rendering, route handlers and server actions.
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  const requestId = request.headers["x-request-id"];
  logger.error("unhandled server error", {
    ...errorFields(error),
    digest,
    request_id: typeof requestId === "string" ? requestId : undefined,
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    route_type: context.routeType,
  });
};
