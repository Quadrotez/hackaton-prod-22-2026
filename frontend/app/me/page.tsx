"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  clearAccessToken,
  getAccessToken,
  getMe,
  type UserPublic,
} from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export default function MePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }

    let cancelled = false;

    getMe(token)
      .then((data) => {
        if (!cancelled) setUser(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        clearAccessToken();
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/");
          return;
        }
        setError(err instanceof ApiError ? err.detail : "Не удалось загрузить профиль");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleLogout() {
    clearAccessToken();
    router.push("/");
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner />
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6">
        <p className="text-destructive">{error}</p>
        <Link href="/" className="underline underline-offset-2">
          На главную
        </Link>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-6 py-12">
      <h2 className="text-xl">PetCare</h2>
      <div className="flex flex-col gap-1">
        <h1>Профиль</h1>
        <p className="text-muted-foreground">Данные вашего аккаунта</p>
      </div>
      <dl className="flex flex-col gap-3">
        <div>
          <dt className="text-sm text-muted-foreground">ID</dt>
          <dd>{user.id}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Создан</dt>
          <dd>{new Date(user.created_at).toLocaleString("ru-RU")}</dd>
        </div>
      </dl>
      <Button variant="outline" onClick={handleLogout}>
        Выйти
      </Button>
    </main>
  );
}
