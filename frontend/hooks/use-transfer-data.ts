"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRequireAuth } from "@/hooks/use-auth";
import { ApiError, getErrorMessage } from "@/lib/api";

type Result<T> = { status: "ready"; data: T } | { status: "error"; error: string };

// Transfer status can change in another account while this page is open.
export function useTransferData<T>(load: () => Promise<T>, fallback: string) {
  const { authorized, handleAuthError } = useRequireAuth();
  const [result, setResult] = useState<Result<T> | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requests = useRef({ version: 0 });

  const refresh = useCallback(() => {
    if (!authorized) return Promise.resolve();
    const request = ++requests.current.version;
    return load().then((data) => {
      if (request !== requests.current.version) return;
      setResult({ status: "ready", data });
      setRefreshError(null);
    }).catch((error: unknown) => {
      if (request !== requests.current.version || handleAuthError(error)) return;
      const message = getErrorMessage(error, fallback);
      const unavailable = error instanceof ApiError && [403, 404].includes(error.status);
      setResult((current) => !unavailable && current?.status === "ready" ? current : { status: "error", error: message });
      setRefreshError(message);
    }).finally(() => {
      if (request === requests.current.version) setRefreshing(false);
    });
  }, [authorized, load, fallback, handleAuthError]);

  useEffect(() => {
    const pending = requests.current;
    void refresh();
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(refreshVisible, 30_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      ++pending.version;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh]);

  const update = useCallback((data: T) => {
    ++requests.current.version;
    setResult({ status: "ready", data });
    setRefreshError(null);
    setRefreshing(false);
  }, []);

  const mutate = useCallback((change: (data: T) => T) => {
    ++requests.current.version;
    setResult((current) => current?.status === "ready" ? { status: "ready", data: change(current.data) } : current);
    setRefreshError(null);
    setRefreshing(false);
  }, []);

  const manualRefresh = useCallback(() => {
    setRefreshing(true);
    return refresh();
  }, [refresh]);

  return {
    ...(result ?? { status: "loading" as const }),
    refresh: manualRefresh,
    retry: manualRefresh,
    update,
    mutate,
    refreshing,
    refreshError,
  };
}
