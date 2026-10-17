"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import FoodCard from "@/components/ui/food-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <Tabs
      value={filter}
      onValueChange={(value) => setFilter(value as FoodFilter)}
      className="contents"
    >
      <header className="flex flex-col gap-5">
        <div>
          <h1 className="font-sans text-[clamp(1.75rem,1.45rem+1.25vw,2.5rem)] font-bold leading-[1.1] tracking-[-0.025em]">
            Корма
          </h1>
        </div>
        {actions}
        <TabsList aria-label="Фильтр по типу" className="theme-shadcn">
          {filters.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </header>

      <p role="status" className="sr-only">
        Найдено кормов: {filteredFoods.length}
      </p>
      <TabsContent
        value={filter}
        aria-label="Список кормов"
        className="flex flex-col gap-3"
      >
        {filteredFoods.map((food) => (
          <div key={food.id} className="flex flex-col gap-2">
            <FoodCard food={food} />
            {onEdit && (
              <Button type="button" variant="secondary" className="theme-shadcn self-end" aria-label={`Изменить корм: ${food.name}`} onClick={() => onEdit(food)}>
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
      </TabsContent>
    </Tabs>
  );
}
