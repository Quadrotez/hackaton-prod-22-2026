import type { Metadata } from "next";
import { FoodManager } from "@/components/food-manager";
import type { Food } from "@/lib/card";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = {
  title: "Корма — PetCare",
};

// Примеры из макета до подключения API кормов.
const foods: Food[] = [
  {
    id: "chicken-dry",
    name: "Сухой корм с курицей",
    description: "Для взрослых кошек",
    type: "dry",
    protein: 30,
    fats: 15,
    carbohydrates: 35,
    calories: 380,
    remainingGrams: 1400,
    totalGrams: 3000,
  },
  {
    id: "beef-wet",
    name: "Влажный корм, говядина",
    description: "Паучи 85 г, для кошек",
    type: "wet",
    protein: 9,
    fats: 5,
    carbohydrates: 2,
    calories: 95,
    remainingGrams: 350,
    totalGrams: 850,
  },
  {
    id: "duck-treat",
    name: "Снек-лакомство с уткой",
    description: "Поощрение, до 10% рациона",
    type: "treat",
    protein: 22,
    fats: 10,
    carbohydrates: 45,
    calories: 390,
    remainingGrams: 80,
    totalGrams: 200,
  },
];

export default function FoodPage() {
  return (
    <PageShell>
      {/* Временное управление кормами: для удаления замените FoodManager на FoodCatalog и его импорт. */}
      <FoodManager foods={foods} />
    </PageShell>
  );
}
