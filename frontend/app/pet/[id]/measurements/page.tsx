import { Suspense } from "react";
import type { Metadata } from "next";
import { MeasurementsPage } from "@/components/measurements-page";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";

export const metadata: Metadata = { title: "Измерения — PetCare" };

export default function Page({ params }: PageProps<"/pet/[id]/measurements">) {
  return <PageShell>
    <Suspense fallback={<PageLoading />}>
      {params.then(({ id }) => {
        const petId = Number(id);
        return Number.isSafeInteger(petId) && petId > 0
          ? <MeasurementsPage petId={petId} />
          : <PageError message="Питомец не найден" backToList />;
      })}
    </Suspense>
  </PageShell>;
}
