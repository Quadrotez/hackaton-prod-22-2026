"use client";

import Link from "next/link";
import { useProtectedData } from "@/hooks/use-auth";
import { listPets } from "@/lib/pets";
import { cardVariants } from "@/components/ui/card";
import { PetCard } from "@/components/pet-card";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { cn } from "cn";
import { ChevronRightIcon, PlusIcon } from "lucide-react";

export default function MePage() {
  const pets = useProtectedData(listPets, "Не удалось загрузить питомцев");

  return (
    <PageShell>
      <PageHeader title="Мои питомцы" />
      {pets.status === "loading" && <PageLoading />}
      {pets.status === "error" && <PageError message={pets.error} onRetry={pets.retry} />}
      {pets.status === "ready" &&
        <ul aria-label="Мои питомцы" className="flex flex-col gap-3">
          {pets.data.map((pet) => (
            <li key={pet.id}>
              <PetCard pet={pet} />
            </li>
          ))}
          <Link
            href="/pet/create"
            className={cn(
              cardVariants(),
              "flex items-center gap-4 outline-none transition-colors hover:bg-card/70 focus-visible:ring-2 focus-visible:ring-foreground",
            )}
          >
            <PlusIcon />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h3>Добавить нового питомца</h3>
            </div>
            <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          </Link>
        </ul>
      }
    </PageShell>
  );
}
