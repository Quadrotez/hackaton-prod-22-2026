import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";
import { HealthSectionPage } from "@/components/ui/health-section-page";

export const metadata: Metadata = { title: "Обработки — PetCare" };

export default function Page({ params }: PageProps<"/pet/[id]/health/parasites">) {
  return (
    <PageShell>
      <Suspense fallback={<PageLoading />}>
        {params.then(({ id }) => {
          const petId = Number(id);
          return Number.isSafeInteger(petId) && petId > 0 ? (
            <HealthSectionPage petId={petId} section="parasites" />
          ) : <PageError message="Питомец не найден" backToList />;
        })}
      </Suspense>
    </PageShell>
  );
}
