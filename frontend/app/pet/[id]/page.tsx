import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";
import { PetDetails } from "@/components/pet-details";

export const metadata: Metadata = {
  title: "Питомец — PetCare",
};

export default function PetPage({ params }: PageProps<"/pet/[id]">) {
  return (
    <PageShell>
      <Suspense fallback={<PageLoading />}>
        {params.then(({ id }) => {
          const petId = Number(id);
          return Number.isInteger(petId) && petId > 0 ? (
            <PetDetails petId={petId} />
          ) : (
            <PageError message="Питомец не найден" backToList />
          );
        })}
      </Suspense>
    </PageShell>
  );
}
