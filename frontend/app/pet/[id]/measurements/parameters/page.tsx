import { Suspense } from "react";
import type { Metadata } from "next";
import { MeasurementParametersPage } from "@/components/measurement-parameters-page";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";

export const metadata: Metadata = { title: "Параметры измерений — PetCare" };

export default function Page({ params }: PageProps<"/pet/[id]/measurements/parameters">) {
  return <PageShell>
    <Suspense fallback={<PageLoading />}>
      {params.then(({ id }) => {
        const petId = Number(id);
        return Number.isSafeInteger(petId) && petId > 0
          ? <MeasurementParametersPage petId={petId} />
          : <PageError message="Питомец не найден" backToList />;
      })}
    </Suspense>
  </PageShell>;
}
