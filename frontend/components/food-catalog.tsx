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

export function FoodCatalog({ foods, actions, onEdit }: FoodCatalogProps & {
  actions?: React.ReactNode;
  onEdit?: (food: FoodCatalogProps["foods"][number]) => void;
}) {
  const [filter, setFilter] = useState<FoodFilter>("all");
  const filteredFoods = filter === "all"
    ? foods
    : foods.filter((food) => food.type === filter);

  return (
    <>
      <header className="flex flex-col gap-5">
        <div>
          <h1 className="font-sans text-[clamp(1.75rem,1.45rem+1.25vw,2.5rem)] font-bold leading-[1.1] tracking-[-0.025em]">
            Корма
          </h1>
          <p className="mt-1 text-[clamp(0.9375rem,0.9rem+0.15vw,1rem)] leading-[1.55] text-muted-foreground">
            Состав питания и остатки на складе
          </p>
        </div>
        {actions}
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
              className="h-8 rounded-full bg-card px-3 text-xs aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/80"
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
        className="flex flex-col gap-3"
      >
        {filteredFoods.map((food) => (
          <div key={food.id} className="flex flex-col gap-2">
            <FoodCard food={food} />
            {onEdit && (
              <Button type="button" variant="outline" className="self-end" aria-label={`Изменить корм: ${food.name}`} onClick={() => onEdit(food)}>
                Изменить
              </Button>
            )}
          </div>
        ))}
        {filteredFoods.length === 0 && (
          <p className="rounded-2xl border bg-card p-5 text-center text-sm text-muted-foreground">
            Кормов этого типа пока нет
          </p>
        )}
      </section>
    </>
  );
}
