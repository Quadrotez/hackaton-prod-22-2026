import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";
import { PetTransfer } from "@/components/pet-transfer";

export const metadata: Metadata = {
  title: "Поделиться питомцем — PetCare",
};

export default function TransferPage({ params }: PageProps<"/pet/[id]/transfer">) {
  return (
    <PageShell>
      <Suspense fallback={<PageLoading />}>
        {params.then(({ id }) => {
          const petId = Number(id);
          return Number.isInteger(petId) && petId > 0 ? (
            <PetTransfer key={petId} petId={petId} />
          ) : (
            <PageError message="Питомец не найден" backToList />
          );
        })}
      </Suspense>
    </PageShell>
  );
}
