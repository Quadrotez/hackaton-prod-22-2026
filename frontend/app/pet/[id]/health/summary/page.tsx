import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";
import { DoctorSummaryPage } from "@/components/ui/doctor-summary-page";

export const metadata: Metadata = { title: "Сводка для врача — PetCare" };

export default function Page({ params }: PageProps<"/pet/[id]/health/summary">) {
  return (
    <PageShell>
      <Suspense fallback={<PageLoading />}>
        {params.then(({ id }) => {
          const petId = Number(id);
          return Number.isSafeInteger(petId) && petId > 0 ? (
            <DoctorSummaryPage petId={petId} />
          ) : <PageError message="Питомец не найден" backToList />;
        })}
      </Suspense>
    </PageShell>
  );
}
