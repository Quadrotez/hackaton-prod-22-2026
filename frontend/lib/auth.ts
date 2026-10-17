import { apiFetch } from "@/lib/api";
import { setAccessToken } from "@/lib/session";

export type Credentials = {
  email: string;
  password: string;
};

export type UserPublic = {
  id: number;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  created_at: string;
};

export type UserUpdate = {
  name: string;
};

export const AVATAR_PATH = "/api/v1/auth/me/avatar";

export type TokenResponse = {
  access_token: string;
  token_type: string;
};

export function register(credentials: Credentials) {
  return apiFetch<UserPublic>("/api/v1/auth/register", {
    method: "POST",
    body: credentials,
  });
}

export async function login(credentials: Credentials): Promise<void> {
  const { access_token } = await apiFetch<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    body: credentials,
  });
  setAccessToken(access_token);
}

export async function registerAndLogin(credentials: Credentials): Promise<void> {
  await register(credentials);
  await login(credentials);
}

export function getMe() {
  return apiFetch<UserPublic>("/api/v1/auth/me", { method: "GET", auth: true });
}

export function updateMe(data: UserUpdate) {
  return apiFetch<UserPublic>("/api/v1/auth/me", { method: "PATCH", body: data, auth: true });
}

export function uploadAvatar(file: File | Blob) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<UserPublic>(AVATAR_PATH, { method: "POST", body: formData, auth: true });
}
