"use client";

import { useId, useState, type FormEvent } from "react";
import { FoodCatalog } from "@/components/food-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Food, FoodCatalogProps } from "@/lib/card";

// ВРЕМЕННЫЙ БЛОК управления кормами. Можно удалить этот файл и заменить
// FoodManager на FoodCatalog в app/food/page.tsx. API и FoodCard не затронуты.
const numericFields = [
  { name: "protein", label: "Белки, г на 100 г", max: 100 },
  { name: "fats", label: "Жиры, г на 100 г", max: 100 },
  { name: "carbohydrates", label: "Углеводы, г на 100 г", max: 100 },
  { name: "calories", label: "Ккал на 100 г" },
  { name: "totalGrams", label: "Всего корма, г" },
  { name: "remainingGrams", label: "Осталось корма, г" },
] as const;

export function FoodManager({ foods }: FoodCatalogProps) {
  const [items, setItems] = useState(foods);
  const [editing, setEditing] = useState<Food | "new" | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const formId = useId();
  const current = editing && editing !== "new" ? editing : null;

  function open(food: Food | "new") {
    setError("");
    setStatus("");
    setEditing(food);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const values = Object.fromEntries(numericFields.map(({ name }) => [name, Number(data.get(name))])) as Pick<Food, typeof numericFields[number]["name"]>;
    const type = data.get("type");
    if (!name || !["dry", "wet", "treat"].includes(String(type)) ||
      Object.values(values).some((value) => !Number.isFinite(value) || value < 0) ||
      values.totalGrams <= 0 || values.remainingGrams > values.totalGrams ||
      values.protein > 100 || values.fats > 100 || values.carbohydrates > 100) {
      setError("Проверьте данные: остаток не может превышать общий вес, а БЖУ — 100 г.");
      return;
    }
    const food: Food = {
      ...values,
      id: current?.id ?? crypto.randomUUID(),
      name,
      description: String(data.get("description") ?? "").trim(),
      type: type as Food["type"],
    };
    setItems((previous) => current ? previous.map((item) => item.id === current.id ? food : item) : [...previous, food]);
    setEditing(null);
    setStatus(current ? "Корм изменён" : "Корм добавлен. Он доступен в соответствующем фильтре.");
  }

  return (
    <>
      <FoodCatalog foods={items} onEdit={open} actions={
        <Button type="button" onClick={() => open("new")}>Добавить корм</Button>
      } />
      <p role="status" className="text-sm text-muted-foreground">{status}</p>
      {editing && (
        <section aria-labelledby={`${formId}-title`} className="rounded-2xl border bg-card p-5">
          <h2 id={`${formId}-title`} className="text-lg font-semibold">{current ? "Изменить корм" : "Добавить корм"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Изменения сохраняются до перезагрузки страницы.</p>
          <form key={current?.id ?? "new"} onSubmit={save} className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Название
              <Input name="name" required maxLength={150} defaultValue={current?.name} autoFocus />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Описание
              <Input name="description" maxLength={300} defaultValue={current?.description} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Тип корма
              <select name="type" defaultValue={current?.type ?? "dry"} className="h-9 rounded-lg border bg-background px-2">
                <option value="dry">Сухой</option>
                <option value="wet">Влажный</option>
                <option value="treat">Лакомство</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {numericFields.map((field) => (
                <label key={field.name} className="flex flex-col gap-1 text-sm">
                  {field.label}
                  <Input name={field.name} type="number" required min={field.name === "totalGrams" ? 0.01 : 0} max={"max" in field ? field.max : undefined} step="0.01" defaultValue={current?.[field.name] ?? 0} />
                </label>
              ))}
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Сохранить</Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Отмена</Button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
