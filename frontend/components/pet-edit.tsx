"use client";

import { useCallback } from "react";
import { useProtectedData } from "@/hooks/use-auth";
import { getPet } from "@/lib/pets";
import { PageError, PageLoading } from "@/components/page-state";
import { PetForm } from "@/components/pet-form";

export function PetEdit({ petId }: { petId: number }) {
  const load = useCallback(() => getPet(petId), [petId]);
  const pet = useProtectedData(load, "Не удалось загрузить питомца");

  if (pet.status === "loading") return <PageLoading />;
  if (pet.status === "error") return <PageError message={pet.error} onRetry={pet.retry} backToList />;
  return <PetForm pet={pet.data} />;
}
