"use client";

import { useProtectedData } from "@/hooks/use-auth";
import { listPets } from "@/lib/pets";
import { listEvents } from "@/lib/events";
import { HomeDashboard } from "@/components/home";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";

export default function MePage() {
  const pets = useProtectedData(listPets, "Не удалось загрузить питомцев");
  const events = useProtectedData(listEvents, "Не удалось загрузить события");

  return (
    <PageShell contentClassName="max-w-5xl">
      <PageHeader title="Главная" />
      {(pets.status === "loading" || events.status === "loading") && <PageLoading />}
      {pets.status === "error" && <PageError message={pets.error} onRetry={pets.retry} />}
      {pets.status !== "error" && events.status === "error" && (
        <PageError message={events.error} onRetry={events.retry} />
      )}
      {pets.status === "ready" && events.status === "ready" && (
        <HomeDashboard pets={pets.data} events={events.data} />
      )}
    </PageShell>
  );
}