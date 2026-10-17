import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";
import { HealthPage } from "@/components/ui/health-page";

export const metadata: Metadata = {
  title: "Здоровье питомца — PetCare",
};

export default function PetHealthPage({ params, searchParams }: PageProps<"/pet/[id]/health">) {
  return (
    <PageShell contentClassName="max-w-2xl">
      <Suspense fallback={<PageLoading />}>
        {Promise.all([params, searchParams]).then(([{ id }, query]) => {
          const view = query.view === "plan" || query.view === "history" ? query.view : "observations";
          const event = typeof query.event === "string" && /^(visit|vaccine|medicine)-\d+$/.test(query.event) ? query.event : "";
          const petId = Number(id);
          return Number.isInteger(petId) && petId > 0 ? (
            <HealthPage petId={petId} initialView={view} highlightedEvent={event} />
          ) : (
            <PageError message="Питомец не найден" backToList />
          );
        })}
      </Suspense>
    </PageShell>
  );
}
