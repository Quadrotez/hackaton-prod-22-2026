const TOKEN_KEY = "petcare_access_token";

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  notify();
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  notify();
}

export function subscribeToAccessToken(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
