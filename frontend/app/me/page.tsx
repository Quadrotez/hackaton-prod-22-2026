"use client";

import { useRequireAuth } from "@/hooks/use-auth";
import { useActivePet } from "@/components/active-pet-provider";
import { HomeDashboard } from "@/components/home";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";

export default function MePage() {
  const { authorized } = useRequireAuth();
  const { pets, status, error, refreshPets } = useActivePet();

  return (
    <PageShell>
      {(!authorized || status === "loading") && <PageLoading />}
      {authorized && status === "error" && <PageError message={error ?? "Не удалось загрузить питомцев"} onRetry={refreshPets} />}
      {authorized && status === "ready" && <HomeDashboard pets={pets} />}
    </PageShell>
  );
}