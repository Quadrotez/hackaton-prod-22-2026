import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";
import { PetEdit } from "@/components/pet-edit";

export const metadata: Metadata = {
  title: "Редактировать питомца — PetCare",
};

export default function EditPetPage({ params }: PageProps<"/pet/[id]/edit">) {
  return (
    <PageShell>
      <Suspense fallback={<PageLoading />}>
        {params.then(({ id }) => {
          const petId = Number(id);
          return Number.isInteger(petId) && petId > 0 ? (
            <PetEdit petId={petId} />
          ) : (
            <PageError message="Питомец не найден" backToList />
          );
        })}
      </Suspense>
    </PageShell>
  );
}
