import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";
import { HealthPage } from "@/components/ui/health-page";

export const metadata: Metadata = {
  title: "Здоровье питомца — PetCare",
};

export default function PetHealthPage({ params }: PageProps<"/pet/[id]/health">) {
  return (
    <PageShell contentClassName="max-w-2xl">
      <Suspense fallback={<PageLoading />}>
        {params.then(({ id }) => {
          const petId = Number(id);
          return Number.isInteger(petId) && petId > 0 ? (
            <HealthPage petId={petId} />
          ) : (
            <PageError message="Питомец не найден" backToList />
          );
        })}
      </Suspense>
    </PageShell>
  );
}
