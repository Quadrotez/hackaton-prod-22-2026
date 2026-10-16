"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import FoodCard from "@/components/ui/food-card";
import type { FoodCatalogProps, FoodFilter } from "@/lib/card";

const filters: { value: FoodFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "dry", label: "Сухие" },
  { value: "wet", label: "Влажные" },
  { value: "treat", label: "Лакомства" },
];

export function FoodCatalog({ foods }: FoodCatalogProps) {
  const [filter, setFilter] = useState<FoodFilter>("all");
  const filteredFoods = filter === "all"
    ? foods
    : foods.filter((food) => food.type === filter);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-sans text-[32px] font-bold leading-[1.15] tracking-normal">
            Корма
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Состав питания и остатки на складе
          </p>
        </div>
        <div
          role="group"
          aria-label="Фильтр по типу"
          className="flex flex-wrap gap-2"
        >
          {filters.map(({ value, label }) => (
            <Button
              key={value}
              type="button"
              variant="outline"
              aria-pressed={filter === value}
              aria-controls="food-list"
              onClick={() => setFilter(value)}
              className="h-10 rounded-full bg-white px-4 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground/90"
            >
              {label}
            </Button>
          ))}
        </div>
      </header>

      <p role="status" className="sr-only">
        Найдено кормов: {filteredFoods.length}
      </p>
      <section
        id="food-list"
        aria-label="Список кормов"
        className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-5"
      >
        {filteredFoods.map((food) => <FoodCard key={food.id} food={food} />)}
        {filteredFoods.length === 0 && (
          <p className="col-span-full py-10 text-center text-muted-foreground">
            Кормов этого типа пока нет
          </p>
        )}
      </section>
    </>
  );
}
