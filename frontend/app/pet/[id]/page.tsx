import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";
import { PetDetails } from "@/components/pet-details";

export const metadata: Metadata = {
  title: "Питомец — PetCare",
};

export default function PetPage({ params, searchParams }: PageProps<"/pet/[id]">) {
  return (
    <PageShell>
      <Suspense fallback={<PageLoading />}>
        {Promise.all([params, searchParams]).then(([{ id }, query]) => {
          const petId = Number(id);
          return Number.isInteger(petId) && petId > 0 ? (
            <PetDetails key={petId} petId={petId} startFeeding={query.feed === "1"} />
          ) : (
            <PageError message="Питомец не найден" backToList />
          );
        })}
      </Suspense>
    </PageShell>
  );
}
