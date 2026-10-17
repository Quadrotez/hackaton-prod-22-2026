import type { Metadata } from "next";
import { FoodManager } from "@/components/food-manager";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = {
  title: "Корма — PetCare",
};

export default function FoodPage() {
  return (
    <PageShell>
      <FoodManager />
    </PageShell>
  );
}
