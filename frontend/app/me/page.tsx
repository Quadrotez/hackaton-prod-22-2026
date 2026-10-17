"use client";

import { useProtectedData } from "@/hooks/use-auth";
import { listPets } from "@/lib/pets";
import { HomeDashboard } from "@/components/home";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";

export default function MePage() {
  const pets = useProtectedData(listPets, "Не удалось загрузить питомцев");

  return (
    <PageShell>
      {pets.status === "loading" && <PageLoading />}
      {pets.status === "error" && <PageError message={pets.error} onRetry={pets.retry} />}
      {pets.status === "ready" && <HomeDashboard pets={pets.data} />}
    </PageShell>
  );
}