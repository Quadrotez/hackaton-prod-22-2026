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
import { listPets, type Pet } from "@/lib/pets";
import { Spinner } from "@/components/ui/spinner";
import { PetCard } from "@/components/pet-card";
import { Menu } from "@/components/menu";

export default function MePage() {
  const mockPets: Pet[] = [
    {"id": 1, "name": "Дусяр", "breed": "Сибирская", "species": "Кошка", "photo_url": "/cat.png", "birth_date": "2016-10-08"},
    {"id": 2, "name": "Дусяр", "breed": "Сибирская", "species": "Кошка", "photo_url": "/cat.png", "birth_date": "2016-10-08"}
  ]

  const router = useRouter();
  const [user, setUser] = useState<UserPublic | null>(null);
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }

    let cancelled = false;

    Promise.all([getMe(token), listPets(token)])
      .then(([userData, petsData]) => {
        if (cancelled) return;
        setUser(userData);
        setPets(mockPets);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          clearAccessToken();
          router.replace("/");
          return;
        }
        setError(
          err instanceof ApiError
            ? err.detail
            : "Не удалось загрузить профиль",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-secondary px-6">
      {pets?.map((pet) => (
        <div key={pet.id}>
          <PetCard pet={pet} />
        </div>
      ))}
      <Menu />
    </div>
  );
}
