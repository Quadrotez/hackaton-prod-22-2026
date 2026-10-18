"use client";

import { useState, type FormEvent } from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import FoodCard from "@/components/ui/food-card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProtectedData, useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import type { FoodFilter } from "@/lib/card";
import {
  createFood,
  deleteFood,
  foodTypeLabels,
  listFoods,
  updateFood,
  type Food,
  type FoodCreate,
} from "@/lib/foods";

const filters: { value: FoodFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "dry", label: "Сухие" },
  { value: "wet", label: "Влажные" },
  { value: "treat", label: "Лакомства" },
];

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

function amount({ max, integer = false }: { max?: number; integer?: boolean } = {}) {
  return z.string().trim().min(1, "Заполните поле")
    .transform((value) => Number(value.replace(",", ".")))
    .refine((value) => Number.isFinite(value) && value >= 0, "Укажите число не меньше нуля")
    .refine((value) => max === undefined || value <= max, `Не больше ${max} г`)
    .refine((value) => !integer || Number.isInteger(value), "Укажите целое число граммов");
}

const foodSchema = z.object({
  name: z.string().trim().min(1, "Введите название корма").max(255, "Не больше 255 символов"),
  description: z.string().trim().max(300, "Не больше 300 символов"),
  type: z.enum(["dry", "wet", "treat"], "Выберите тип корма"),
  protein: amount({ max: 100 }),
  fats: amount({ max: 100 }),
  carbohydrates: amount({ max: 100 }),
  calories: amount(),
  total_grams: amount({ integer: true }).refine((grams) => grams > 0, "Укажите вес больше нуля"),
  remaining_grams: amount({ integer: true }).optional(),
}).refine(
  (food) => food.remaining_grams === undefined || food.remaining_grams <= food.total_grams,
  { path: ["remaining_grams"], message: "Остаток не может быть больше веса упаковки" },
);

type FormErrors = Partial<Record<keyof z.input<typeof foodSchema>, string>>;

const numericFields = [
  { name: "protein", label: "Белки, г на 100 г", step: 0.01 },
  { name: "fats", label: "Жиры, г на 100 г", step: 0.01 },
  { name: "carbohydrates", label: "Углеводы, г на 100 г", step: 0.01 },
  { name: "calories", label: "Ккал на 100 г", step: 0.01 },
  { name: "total_grams", label: "Вес упаковки, г", step: 1 },
  { name: "remaining_grams", label: "Осталось корма, г", step: 1, editOnly: true },
] as const;

function FoodForm({ food, pending, onSave, onCancel }: {
  food: Food | null;
  pending: boolean;
  onSave: (payload: FoodCreate) => void;
  onCancel: () => void;
}) {
  const [errors, setErrors] = useState<FormErrors>({});
  const fields = numericFields.filter((field) => food || !("editOnly" in field));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = foodSchema.safeParse({
      name: data.get("name"),
      description: data.get("description"),
      type: data.get("type"),
      ...Object.fromEntries(fields.map(({ name }) => [name, data.get(name)])),
    });

    if (!result.success) {
      const issues: FormErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FormErrors;
        if (!issues[key]) issues[key] = issue.message;
      }
      setErrors(issues);
      const input = form.elements.namedItem(String(result.error.issues[0]?.path[0]));
      if (input instanceof HTMLElement) input.focus();
      return;
    }

    setErrors({});
    const { remaining_grams, description, ...rest } = result.data;
    onSave({
      ...rest,
      description: description || null,
      remaining_grams: remaining_grams ?? rest.total_grams,
    });
  }

  const describedBy = (name: keyof FormErrors) => errors[name] ? `food-${name}-error` : undefined;

  return (
    <Card role="region" aria-label={food ? `Изменить корм: ${food.name}` : "Новый корм"} className="space-y-4">
      <h2>{food ? "Изменить корм" : "Добавить корм"}</h2>
      <form onSubmit={submit} noValidate aria-busy={pending}>
        <FieldSet disabled={pending}>
          <FieldGroup className="gap-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="food-name">Название</FieldLabel>
              <Input id="food-name" name="name" required maxLength={255} defaultValue={food?.name} placeholder="Например, Royal Canin Indoor" autoFocus aria-invalid={!!errors.name} aria-describedby={describedBy("name")} />
              {errors.name && <FieldError id="food-name-error">{errors.name}</FieldError>}
            </Field>
            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="food-description">Описание <span className="font-normal text-muted-foreground">(необязательно)</span></FieldLabel>
              <Input id="food-description" name="description" maxLength={300} defaultValue={food?.description ?? ""} aria-invalid={!!errors.description} aria-describedby={describedBy("description")} />
              {errors.description && <FieldError id="food-description-error">{errors.description}</FieldError>}
            </Field>
            <Field data-invalid={!!errors.type}>
              <FieldLabel htmlFor="food-type">Тип корма</FieldLabel>
              <select id="food-type" name="type" defaultValue={food?.type ?? "dry"} aria-invalid={!!errors.type} aria-describedby={describedBy("type")} className={selectClass}>
                {Object.entries(foodTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {errors.type && <FieldError id="food-type-error">{errors.type}</FieldError>}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {fields.map((field) => (
                <Field key={field.name} data-invalid={!!errors[field.name]}>
                  <FieldLabel htmlFor={`food-${field.name}`}>{field.label}</FieldLabel>
                  <Input id={`food-${field.name}`} name={field.name} type="number" inputMode="decimal" required min={0} step={field.step} defaultValue={food?.[field.name] ?? 0} aria-invalid={!!errors[field.name]} aria-describedby={describedBy(field.name)} />
                  {errors[field.name] && <FieldError id={`food-${field.name}-error`}>{errors[field.name]}</FieldError>}
                </Field>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="lg" variant="secondary" className="theme-shadcn">
                {pending && <Spinner />}
                Сохранить
              </Button>
              <Button type="button" size="lg" variant="secondary" className="theme-shadcn" onClick={onCancel}>Отмена</Button>
            </div>
          </FieldGroup>
        </FieldSet>
      </form>
    </Card>
  );
}

export function FoodManager() {
  const state = useProtectedData(listFoods, "Не удалось загрузить корма");
  const { handleAuthError } = useRequireAuth();
  const [filter, setFilter] = useState<FoodFilter>("all");
  const [editing, setEditing] = useState<Food | "new" | null>(null);
  const [deleting, setDeleting] = useState<Food | null>(null);
  const [pending, setPending] = useState(false);

  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") return <PageError message={state.error} onRetry={state.retry} />;

  const { data: items, update } = state;
  const current = editing && editing !== "new" ? editing : null;
  const visible = filter === "all" ? items : items.filter((food) => food.type === filter);

  async function run(action: () => Promise<void>, success: string, failure: string) {
    setPending(true);
    try {
      await action();
      toast.success(success);
      return true;
    } catch (error) {
      if (!handleAuthError(error)) toast.error(getErrorMessage(error, failure));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function save(payload: FoodCreate) {
    const saved = current
      ? await run(async () => {
        const updated = await updateFood(current.id, payload);
        update(items.map((item) => item.id === updated.id ? updated : item));
      }, "Корм сохранён", "Не удалось сохранить корм")
      : await run(async () => {
        update([...items, await createFood(payload)]);
      }, "Корм добавлен", "Не удалось добавить корм");
    if (saved) setEditing(null);
  }

  async function remove(food: Food) {
    const removed = await run(async () => {
      await deleteFood(food.id);
      update(items.filter((item) => item.id !== food.id));
    }, "Корм удалён", "Не удалось удалить корм");
    if (removed) {
      setDeleting(null);
      if (current?.id === food.id) setEditing(null);
    }
  }

  return (
    <>
      <PageHeader title="Корма" />
      <Tabs value={filter} onValueChange={(value) => setFilter(value as FoodFilter)} className="contents">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="Фильтр по типу" className="theme-shadcn">
            {filters.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>{label}</TabsTrigger>
            ))}
          </TabsList>
          {!editing && (
            <Button type="button" variant="secondary" className="theme-shadcn hover:bg-background" disabled={pending} onClick={() => setEditing("new")}>
              <PlusIcon aria-hidden="true" />
              Добавить
            </Button>
          )}
        </div>

        {editing && (
          <FoodForm key={current?.id ?? "new"} food={current} pending={pending} onSave={save} onCancel={() => setEditing(null)} />
        )}

        <p role="status" className="sr-only">Найдено кормов: {visible.length}</p>
        <TabsContent value={filter} aria-label="Список кормов" className="flex flex-col gap-3">
          {visible.map((food) => (
            <FoodCard key={food.id} food={food}>
              <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setEditing(food)}>
                <PencilIcon aria-hidden="true" />
                Изменить
              </Button>
              <Button type="button" variant="secondary" size="icon" className="ml-auto" disabled={pending} onClick={() => setDeleting(food)} aria-label={`Удалить корм: ${food.name}`}>
                <Trash2Icon aria-hidden="true" />
              </Button>
            </FoodCard>
          ))}
          {visible.length === 0 && (
            <Card className="flex flex-col items-start gap-3">
              <h2>{filter === "all" ? "Кормов пока нет" : "Кормов этого типа пока нет"}</h2>
              <p className="text-sm text-muted-foreground">Добавьте корм, чтобы отмечать кормления и следить за остатком.</p>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open && !pending) setDeleting(null); }}>
        <AlertDialogContent className="theme-shadcn">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить корм «{deleting?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Корм пропадёт из списка. Записи о кормлениях сохранятся вместе с его названием.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => deleting && remove(deleting)}>
              {pending && <Spinner />}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
