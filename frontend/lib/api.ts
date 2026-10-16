const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

type FetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string | null;
};

async function parseError(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map(String).join(", ")
          : response.statusText || "Request failed";
    return new ApiError(response.status, detail);
  } catch {
    return new ApiError(response.status, response.statusText || "Request failed");
  }
}

export async function apiFetch<T>(
  path: string,
  { body, token, headers, ...init }: FetchOptions = {},
): Promise<T> {
  const requestHeaders = new Headers(headers);

  if (body !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
