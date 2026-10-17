"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FoodCatalog } from "@/components/food-catalog";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useProtectedData, useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import {
  createFood,
  deleteFood,
  foodTypeLabels,
  listFoods,
  updateFood,
  type Food,
  type FoodCreate,
  type FoodType,
} from "@/lib/foods";

const numericFields = [
  { name: "protein", label: "Белки, г на 100 г", max: 100 },
  { name: "fats", label: "Жиры, г на 100 г", max: 100 },
  { name: "carbohydrates", label: "Углеводы, г на 100 г", max: 100 },
  { name: "calories", label: "Ккал на 100 г" },
  { name: "total_g", label: "Вес упаковки, г" },
  { name: "remaining_g", label: "Осталось корма, г", editOnly: true },
] as const;

function parseNumber(value: FormDataEntryValue | null): number {
  return Number(String(value ?? "").replace(",", "."));
}

export function FoodManager() {
  const state = useProtectedData(listFoods, "Не удалось загрузить корма");
  const { handleAuthError } = useRequireAuth();
  const [editing, setEditing] = useState<Food | "new" | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const formId = useId();
  const current = editing && editing !== "new" ? editing : null;

  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") return <PageError message={state.error} onRetry={state.retry} />;

  const { data: items, update } = state;

  function open(food: Food | "new") {
    setError("");
    setStatus("");
    setEditing(food);
  }

  function reportError(error: unknown, fallback: string) {
    if (!handleAuthError(error)) toast.error(getErrorMessage(error, fallback));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const type = String(data.get("type"));
    const values = Object.fromEntries(
      numericFields
        .filter((field) => current || !("editOnly" in field))
        .map(({ name }) => [name, parseNumber(data.get(name))]),
    ) as Pick<FoodCreate, "protein" | "fats" | "carbohydrates" | "calories" | "total_g"> & { remaining_g?: number };
    // Новый корм — целая упаковка, остаток дальше ведёт бэк
    const remaining = values.remaining_g ?? values.total_g;

    if (!name || !(type in foodTypeLabels) ||
      Object.values(values).some((value) => !Number.isFinite(value) || value < 0) ||
      values.total_g <= 0 || remaining > values.total_g ||
      values.protein > 100 || values.fats > 100 || values.carbohydrates > 100) {
      setError("Проверьте данные: остаток не может превышать вес упаковки, а БЖУ — 100 г.");
      return;
    }

    const payload: FoodCreate = {
      ...values,
      remaining_g: remaining,
      name,
      description: String(data.get("description") ?? "").trim() || null,
      type: type as FoodType,
    };
    setPending(true);
    try {
      if (current) {
        const updated = await updateFood(current.id, payload);
        update(items.map((item) => item.id === updated.id ? updated : item));
        setStatus("Корм изменён");
      } else {
        const created = await createFood(payload);
        update([...items, created]);
        setStatus("Корм добавлен. Он доступен в соответствующем фильтре.");
      }
      setEditing(null);
    } catch (error) {
      reportError(error, current ? "Не удалось сохранить корм" : "Не удалось добавить корм");
    } finally {
      setPending(false);
    }
  }

  async function remove(food: Food) {
    setPending(true);
    try {
      await deleteFood(food.id);
      update(items.filter((item) => item.id !== food.id));
      setEditing(null);
      setStatus(`Корм «${food.name}» удалён`);
    } catch (error) {
      reportError(error, "Не удалось удалить корм");
    } finally {
      setPending(false);
    }
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
          <form key={current?.id ?? "new"} onSubmit={save} aria-busy={pending} className="mt-4 flex flex-col gap-4">
            <fieldset disabled={pending} className="contents">
              <label className="flex flex-col gap-1 text-sm">
                Название
                <Input name="name" required maxLength={255} defaultValue={current?.name} autoFocus />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Описание
                <Input name="description" maxLength={300} defaultValue={current?.description ?? ""} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Тип корма
                <select name="type" defaultValue={current?.type ?? "dry"} className="h-9 rounded-lg border bg-background px-2">
                  {Object.entries(foodTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {numericFields.filter((field) => current || !("editOnly" in field)).map((field) => (
                  <label key={field.name} className="flex flex-col gap-1 text-sm">
                    {field.label}
                    <Input name={field.name} type="number" inputMode="decimal" required min={field.name === "total_g" ? 1 : 0} max={"max" in field ? field.max : undefined} step="0.01" defaultValue={current?.[field.name] ?? 0} />
                  </label>
                ))}
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit">
                  {pending && <Spinner />}
                  Сохранить
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Отмена</Button>
                {current && <FoodDeleteButton food={current} pending={pending} onConfirm={() => remove(current)} />}
              </div>
            </fieldset>
          </form>
        </section>
      )}
    </>
  );
}

function FoodDeleteButton({ food, pending, onConfirm }: { food: Food; pending: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="destructive" className="ml-auto" />}>
        Удалить
      </AlertDialogTrigger>
      <AlertDialogContent className="theme-shadcn">
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить корм «{food.name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Корм пропадёт из списка. Записи о кормлениях сохранятся, но без названия корма.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={onConfirm}>Удалить</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
