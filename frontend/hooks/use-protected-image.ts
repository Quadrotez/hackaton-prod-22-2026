"use client";

import { useEffect, useState } from "react";
import { apiFetchBlob } from "@/lib/api";

export function useProtectedImage(path: string, version: string | null): string | null {
  const key = version ? `${path}#${version}` : null;
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let url: string | null = null;

    apiFetchBlob(path, { method: "GET", auth: true })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setLoaded({ key, url });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, path]);

  return loaded && loaded.key === key ? loaded.url : null;
}
