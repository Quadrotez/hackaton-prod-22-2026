"use client";

import { useCallback } from "react";
import { useProtectedData } from "@/hooks/use-auth";
import { getPet, isCaretaker } from "@/lib/pets";
import Link from "next/link";
import { PageError, PageLoading } from "@/components/page-state";
import { PetForm } from "@/components/pet-form";

export function PetEdit({ petId }: { petId: number }) {
  const load = useCallback(() => getPet(petId), [petId]);
  const pet = useProtectedData(load, "Не удалось загрузить питомца");

  if (pet.status === "loading") return <PageLoading />;
  if (pet.status === "error") return <PageError message={pet.error} onRetry={pet.retry} backToList />;
  if (isCaretaker(pet.data)) return <>
    <PageError title="Профиль изменяет владелец" message="Вы можете смотреть данные питомца и записывать уход за ним." />
    <Link href={`/pet/${petId}`} className="text-sm underline underline-offset-4">Вернуться к питомцу</Link>
  </>;
  return <PetForm pet={pet.data} />;
}
