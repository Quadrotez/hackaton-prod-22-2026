import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageError } from "@/components/page-state";

export const metadata: Metadata = {
  title: "Страница не найдена — PetCare",
};

export default function NotFound() {
  return (
    <PageShell>
      <PageError
        title="Страница не найдена"
        message="Возможно, ссылка устарела или в адресе опечатка"
        backToList
      />
    </PageShell>
  );
}
