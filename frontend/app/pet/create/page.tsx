import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PetForm } from "@/components/pet-form";

export const metadata: Metadata = {
  title: "Добавить питомца — PetCare",
};

export default function CreatePetPage() {
  return (
    <PageShell>
      <PetForm />
    </PageShell>
  );
}
