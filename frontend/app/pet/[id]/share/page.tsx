import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";
import { PetShare } from "@/components/pet-share";

export const metadata: Metadata = {
  title: "Поделиться питомцем — PetCare",
};

export default function SharePage({ params }: PageProps<"/pet/[id]/share">) {
  return (
    <PageShell>
      <Suspense fallback={<PageLoading />}>
        {params.then(({ id }) => {
          const petId = Number(id);
          return Number.isInteger(petId) && petId > 0 ? (
            <PetShare petId={petId} />
          ) : (
            <PageError message="Питомец не найден" backToList />
          );
        })}
      </Suspense>
    </PageShell>
  );
}
