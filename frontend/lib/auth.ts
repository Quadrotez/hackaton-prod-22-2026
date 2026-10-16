import { ApiError, apiFetch } from "@/lib/api";

const TOKEN_KEY = "petcare_access_token";

export type Credentials = {
  email: string;
  password: string;
};

export type UserPublic = {
  id: number;
  email: string;
  created_at: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
};

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}


export function register(credentials: Credentials) {
  return apiFetch<UserPublic>("/api/v1/auth/register", {
    method: "POST",
    body: credentials,
  });
}

export function login(credentials: Credentials) {
  return apiFetch<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    body: credentials,
  });
}

export async function getMe(token = getAccessToken()): Promise<UserPublic> {
  if (!token) {
    throw new ApiError(401, "Not authenticated");
  }

  return apiFetch<UserPublic>("/api/v1/auth/me", {
    method: "GET",
    token,
  });
}

export async function registerAndLogin(credentials: Credentials) {
  try {
    await register(credentials);
    const { access_token } = await login(credentials);
    setAccessToken(access_token);
    return access_token;
  } catch (error) {
    if (error instanceof ApiError) throw error;
  }
}

export async function loginAndStore(credentials: Credentials) {
  try {
    const { access_token } = await login(credentials);
    setAccessToken(access_token);
    return access_token;
  } catch (error) {
    if (error instanceof ApiError) throw error;
  }
}
