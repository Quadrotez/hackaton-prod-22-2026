"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError, getErrorMessage } from "@/lib/api";
import { clearAccessToken, getAccessToken, subscribeToAccessToken } from "@/lib/session";

// undefined — токен ещё не прочитан (сервер и гидратация), null — пользователь не вошёл
function useAccessToken(): string | null | undefined {
  return useSyncExternalStore(subscribeToAccessToken, getAccessToken, () => undefined);
}

// Защищённая страница: без токена уводит на вход.
// handleAuthError сбрасывает сессию при 401 и возвращает true, если ошибка обработана.
export function useRequireAuth() {
  const router = useRouter();
  const token = useAccessToken();

  useEffect(() => {
    if (token === null) router.replace("/");
  }, [token, router]);

  const handleAuthError = useCallback((error: unknown): boolean => {
    if (!(error instanceof ApiError) || error.status !== 401) return false;
    if (getAccessToken()) {
      toast.error(error.message);
      clearAccessToken();
    }
    return true;
  }, []);

  return { authorized: Boolean(token), handleAuthError };
}

type ProtectedData<T> =
  | { status: "loading" }
  | { status: "error"; error: string; retry: () => void }
  | { status: "ready"; data: T; update: (data: T) => void };

// Загрузка данных защищённой страницы с единым поведением при ошибках.
// load должен быть стабильным (useCallback).
export function useProtectedData<T>(load: () => Promise<T>, fallbackError: string): ProtectedData<T> {
  const { authorized, handleAuthError } = useRequireAuth();
  const [result, setResult] = useState<{ data: T } | { error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;

    load()
      .then((data) => {
        if (!cancelled) setResult({ data });
      })
      .catch((error: unknown) => {
        if (cancelled || handleAuthError(error)) return;
        setResult({ error: getErrorMessage(error, fallbackError) });
      });

    return () => {
      cancelled = true;
    };
  }, [authorized, load, fallbackError, handleAuthError, attempt]);

  // Подменить данные после успешного изменения, без повторной загрузки
  const update = useCallback((data: T) => setResult({ data }), []);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((current) => current + 1);
  }, []);

  if (result === null) return { status: "loading" };
  if ("error" in result) return { status: "error", error: result.error, retry };
  return { status: "ready", data: result.data, update };
}
