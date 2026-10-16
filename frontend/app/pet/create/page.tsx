import type { Metadata } from "next";
import Link from "next/link";
import { PetCreateForm } from "@/components/pet-create-form";

export const metadata: Metadata = {
  title: "Добавить питомца — PetCare",
};

export default function CreatePetPage() {
  return (
    <main className="relative flex min-h-dvh flex-col md:flex-row">
      <Link
        href="/me"
        className="absolute left-6 top-6 z-10 rounded-sm font-heading text-xl outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      >
        PetCare
      </Link>
      <section
        aria-label="Создание профиля питомца"
        className="flex flex-1 items-center justify-center bg-secondary px-6 py-10 md:w-1/2 md:bg-secondary md:px-8 md:py-16"
      >
        <PetCreateForm />
      </section>
    </main>
  );
}
