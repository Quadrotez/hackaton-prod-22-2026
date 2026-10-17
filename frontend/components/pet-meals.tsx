"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { PencilIcon, PlusIcon, StarIcon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { getDaysLeft, isLowStock, type Food } from "@/lib/foods";
import {
  createMeal,
  deleteMeal,
  formatTimeAgo,
  getMealSuggestion,
  rankFoods,
  updateMeal,
  type Meal,
  type MealSuggestion,
} from "@/lib/meals";
import { formatWeight, pluralize } from "@/lib/pets";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const RECENT_MEALS_LIMIT = 5;
const RATES = [1, 2, 3, 4, 5];
// Запас на расхождение часов клиента и сервера
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const quickTimes = [
  { label: "Сейчас", minutes: 0 },
  { label: "30 мин назад", minutes: 30 },
  { label: "1 ч назад", minutes: 60 },
  { label: "3 ч назад", minutes: 180 },
];

function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatFedAt(fedAt: string): string {
  const date = new Date(fedAt);
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const day = date.toDateString() === new Date().toDateString()
    ? "сегодня"
    : date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return `${day}, ${time}`;
}

const mealSchema = z.object({
  food_id: z.coerce.number().int().positive("Выберите корм"),
  portion_g: z.string().trim().min(1, "Укажите порцию")
    .transform((value) => Number(value.replace(",", ".")))
    .refine((grams) => Number.isFinite(grams) && grams > 0, "Укажите порцию числом больше нуля")
    .refine((grams) => grams <= 10_000, "Не больше 10 кг"),
  fed_at: z.string().min(1, "Укажите время кормления")
    .transform((value) => new Date(value))
    .refine((date) => !Number.isNaN(date.getTime()), "Укажите корректное время")
    .refine((date) => date.getTime() <= Date.now() + FUTURE_TOLERANCE_MS, "Время кормления не может быть в будущем")
    .transform((date) => date.toISOString()),
  rate: z.number().int().min(1, "Поставьте оценку").max(5),
  tolerated: z.boolean(),
  reactions: z.string().trim().max(1000, "Не больше 1000 символов"),
  notes: z.string().trim().max(1000, "Не больше 1000 символов"),
});

type MealErrors = Partial<Record<keyof z.infer<typeof mealSchema>, string>>;

const choiceClass =
  "flex items-center justify-center rounded-lg border border-input px-2 py-2 text-sm transition-colors hover:bg-secondary/40 peer-checked:border-foreground/40 peer-checked:bg-secondary peer-focus-visible:ring-2 peer-focus-visible:ring-foreground";

function RateStars({ rate, className }: { rate: number; className?: string }) {
  return (
    <span aria-label={`Оценка ${rate} из 5`} className={cn("inline-flex", className)}>
      {RATES.map((value) => (
        <StarIcon
          key={value}
          aria-hidden="true"
          className={cn("size-3", value <= rate ? "fill-foreground text-foreground" : "text-muted-foreground/50")}
        />
      ))}
    </span>
  );
}

function MealForm({
  petId,
  foods,
  foodsFailed,
  meals,
  meal,
  onSaved,
  onDeleted,
  onCancel,
}: {
  petId: number;
  foods: Food[];
  foodsFailed: boolean;
  meals: Meal[];
  meal?: Meal;
  onSaved: (meal: Meal) => void;
  onDeleted: (meal: Meal) => void;
  onCancel: () => void;
}) {
  const { handleAuthError } = useRequireAuth();
  const ranked = rankFoods(foods, meals);
  const [foodId, setFoodId] = useState(meal?.food_id ? String(meal.food_id) : "");
  const [portion, setPortion] = useState(meal ? String(meal.portion_g) : "");
  const [fedAt, setFedAt] = useState(() => toLocalInput(meal ? new Date(meal.fed_at) : new Date()));
  const [rate, setRate] = useState(meal?.rate ?? 0);
  const [tolerated, setTolerated] = useState(meal?.tolerated ?? true);
  const [suggestion, setSuggestion] = useState<MealSuggestion | null>(null);
  const [errors, setErrors] = useState<MealErrors>({});
  const [pending, setPending] = useState(false);
  const latestFoodId = useRef(foodId);
  const isEdit = meal !== undefined;
  const selected = foods.find((food) => String(food.id) === foodId);
  const portionNumber = Number(portion.replace(",", "."));
  // При правке порция уже списана со склада, учитываем только разницу
  const extraPortion = portionNumber - (meal && String(meal.food_id) === foodId ? meal.portion_g : 0);

  async function handleFoodChange(value: string) {
    setFoodId(value);
    latestFoodId.current = value;
    setSuggestion(null);
    if (isEdit || !value) return;
    try {
      const result = await getMealSuggestion(petId, Number(value));
      if (latestFoodId.current !== value) return;
      setSuggestion(result);
      if (result.suggested_values) {
        setPortion(String(result.suggested_values.portion_g));
        setRate(result.suggested_values.rate);
        setTolerated(result.suggested_values.tolerated);
      }
    } catch (error) {
      // Подсказка необязательна — форму можно заполнить вручную
      handleAuthError(error);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    const result = mealSchema.safeParse({
      food_id: foodId || 0,
      portion_g: portion,
      fed_at: fedAt,
      rate,
      tolerated,
      reactions: formData.get("reactions") ?? "",
      notes: formData.get("notes") ?? "",
    });

    if (!result.success) {
      const fieldErrors: MealErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof MealErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setPending(true);
    try {
      const data = {
        ...result.data,
        reactions: result.data.reactions || null,
        notes: result.data.notes || null,
      };
      const saved = isEdit ? await updateMeal(petId, meal.id, data) : await createMeal(petId, data);
      toast.success(isEdit ? "Запись обновлена" : "Кормление записано");
      onSaved(saved);
    } catch (error) {
      if (!handleAuthError(error)) {
        toast.error(getErrorMessage(error, "Не удалось сохранить кормление. Попробуйте ещё раз"));
      }
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!meal || pending) return;
    setPending(true);
    try {
      await deleteMeal(petId, meal.id);
      toast.success("Запись удалена, порция возвращена в остаток");
      onDeleted(meal);
    } catch (error) {
      if (!handleAuthError(error)) {
        toast.error(getErrorMessage(error, "Не удалось удалить запись. Попробуйте ещё раз"));
      }
    } finally {
      setPending(false);
    }
  }

  if (foods.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 border-t border-secondary pt-3 text-sm">
        <p className="text-muted-foreground">
          {foodsFailed ? "Не удалось загрузить список кормов. Обновите страницу или попробуйте позже" : "Сначала добавьте корм в список кормов"}
        </p>
        <div className="flex gap-2">
          <Link href="/food" className="underline underline-offset-4">К кормам</Link>
          <button type="button" onClick={onCancel} className="text-muted-foreground underline underline-offset-4">Отмена</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="border-t border-secondary pt-3">
      <FieldSet disabled={pending}>
        <FieldGroup className="gap-4">
          <Field data-invalid={Boolean(errors.food_id)}>
            <FieldLabel htmlFor="meal-food">Корм</FieldLabel>
            <select
              id="meal-food"
              value={foodId}
              onChange={(event) => handleFoodChange(event.target.value)}
              aria-invalid={Boolean(errors.food_id)}
              className="h-9 rounded-lg border bg-background px-2 text-sm"
            >
              <option value="" disabled>Выберите корм</option>
              {ranked.map(({ food, avgRate, intolerant }) => (
                <option key={food.id} value={food.id}>
                  {[
                    food.name,
                    intolerant ? "плохо переносит" : avgRate !== null ? `★ ${avgRate.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}` : null,
                    food.remaining_g <= 0 ? "закончился" : null,
                  ].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
            {selected && (
              <p className={cn("text-xs", extraPortion > selected.remaining_g ? "text-destructive" : "text-muted-foreground")}>
                В наличии {formatWeight(selected.remaining_g)}
                {extraPortion > selected.remaining_g && " — порция больше остатка, остаток обнулится"}
              </p>
            )}
            {suggestion?.previously_tried && suggestion.suggested_values && (
              <p className="text-xs text-muted-foreground">
                Подставили значения из прошлого кормления этим кормом
                {!suggestion.suggested_values.tolerated && " — в прошлый раз была реакция"}
              </p>
            )}
            <FieldError>{errors.food_id}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.portion_g)}>
            <FieldLabel htmlFor="meal-portion">Порция, г</FieldLabel>
            <Input
              id="meal-portion"
              inputMode="decimal"
              value={portion}
              onChange={(event) => setPortion(event.target.value)}
              aria-invalid={Boolean(errors.portion_g)}
            />
            <FieldError>{errors.portion_g}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.fed_at)}>
            <FieldLabel htmlFor="meal-fed-at">Когда покормили</FieldLabel>
            <Input
              id="meal-fed-at"
              type="datetime-local"
              value={fedAt}
              onChange={(event) => setFedAt(event.target.value)}
              aria-invalid={Boolean(errors.fed_at)}
            />
            {!isEdit && (
              <div className="flex flex-wrap gap-1.5">
                {quickTimes.map(({ label, minutes }) => (
                  <Button
                    key={minutes}
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={() => setFedAt(toLocalInput(new Date(Date.now() - minutes * 60_000)))}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            )}
            <FieldError>{errors.fed_at}</FieldError>
          </Field>

          <FieldSet data-invalid={Boolean(errors.rate)} className="gap-1">
            <FieldLegend variant="label">Насколько понравилось</FieldLegend>
            <div className="flex gap-1">
              {RATES.map((value) => (
                <label key={value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="rate"
                    value={value}
                    checked={rate === value}
                    onChange={() => setRate(value)}
                    className="peer sr-only"
                  />
                  <StarIcon
                    aria-hidden="true"
                    className={cn(
                      "size-7 rounded-sm transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-foreground",
                      value <= rate ? "fill-primary text-foreground" : "text-muted-foreground",
                    )}
                    strokeWidth={1.5}
                  />
                  <span className="sr-only">{value} из 5</span>
                </label>
              ))}
            </div>
            <FieldError>{errors.rate}</FieldError>
          </FieldSet>

          <FieldSet className="gap-1">
            <FieldLegend variant="label">Как перенёс</FieldLegend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: true, label: "Хорошо" },
                { value: false, label: "Была реакция" },
              ].map((option) => (
                <label key={String(option.value)}>
                  <input
                    type="radio"
                    name="tolerated"
                    checked={tolerated === option.value}
                    onChange={() => setTolerated(option.value)}
                    className="peer sr-only"
                  />
                  <span className={choiceClass}>{option.label}</span>
                </label>
              ))}
            </div>
          </FieldSet>

          <Field data-invalid={Boolean(errors.reactions)}>
            <FieldLabel htmlFor="meal-reactions">Реакции</FieldLabel>
            <Input
              id="meal-reactions"
              name="reactions"
              defaultValue={meal?.reactions ?? ""}
              placeholder={tolerated ? "Необязательно" : "Рвота, зуд, вялость…"}
              maxLength={1000}
            />
            <FieldError>{errors.reactions}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.notes)}>
            <FieldLabel htmlFor="meal-notes">Заметки</FieldLabel>
            <Input id="meal-notes" name="notes" defaultValue={meal?.notes ?? ""} placeholder="Необязательно" maxLength={1000} />
            <FieldError>{errors.notes}</FieldError>
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg">
              {pending && <Spinner />}
              {isEdit ? "Сохранить" : "Записать"}
            </Button>
            <Button type="button" size="lg" variant="outline" onClick={onCancel}>Отмена</Button>
            {isEdit && (
              <Button type="button" size="lg" variant="destructive" className="ml-auto" onClick={handleDelete}>
                Удалить
              </Button>
            )}
          </div>
        </FieldGroup>
      </FieldSet>
    </form>
  );
}

function StockAlerts({ foods, meals }: { foods: Food[]; meals: Meal[] }) {
  const eaten = new Set(meals.map((meal) => meal.food_id));
  const low = foods.filter((food) => eaten.has(food.id) && isLowStock(food));
  if (low.length === 0) return null;

  return (
    <Card role="status" className="flex flex-col gap-1.5 border-destructive/40">
      <h2>Корм заканчивается</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {low.map((food) => {
          const daysLeft = getDaysLeft(food);
          return (
            <li key={food.id} className="flex justify-between gap-3">
              <span className="truncate">{food.name}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {food.remaining_g <= 0
                  ? "закончился"
                  : `${formatWeight(food.remaining_g)}${daysLeft !== null ? ` · ~${daysLeft} ${pluralize(daysLeft, "день", "дня", "дней")}` : ""}`}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function PetMeals({
  petId,
  meals,
  foods,
  now,
  onMealsChange,
}: {
  petId: number;
  meals: Meal[] | null;
  foods: Food[] | null;
  now: number;
  onMealsChange: (meals: Meal[]) => void;
}) {
  const [editing, setEditing] = useState<Meal | "new" | null>(null);
  const [showAll, setShowAll] = useState(false);
  const foodNames = new Map(foods?.map((food) => [food.id, food.name]));
  const visible = meals && (showAll ? meals : meals.slice(0, RECENT_MEALS_LIMIT));
  const knownMeals = meals ?? [];

  return (
    <>
      {meals && foods && <StockAlerts foods={foods} meals={meals} />}

      <Card className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2>Приёмы пищи</h2>
          {editing === null && (
            <Button type="button" onClick={() => setEditing("new")}>
              <PlusIcon aria-hidden="true" />
              Покормить
            </Button>
          )}
        </div>

        {editing !== null && (
          <MealForm
            key={editing === "new" ? "new" : editing.id}
            petId={petId}
            foods={foods ?? []}
            foodsFailed={foods === null}
            meals={knownMeals}
            meal={editing === "new" ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSaved={(saved) => {
              setEditing(null);
              onMealsChange([saved, ...knownMeals.filter((item) => item.id !== saved.id)]);
            }}
            onDeleted={(deleted) => {
              setEditing(null);
              onMealsChange(knownMeals.filter((item) => item.id !== deleted.id));
            }}
          />
        )}

        {visible === null ? (
          <p className="border-t border-secondary pt-2.5 text-sm text-muted-foreground">Не удалось загрузить историю кормлений</p>
        ) : visible.length === 0 ? (
          <p className="border-t border-secondary pt-2.5 text-sm text-muted-foreground">Записей о кормлении пока нет</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {visible.map((meal) => {
              const foodName = (meal.food_id !== null && foodNames.get(meal.food_id)) || "Корм удалён";
              return (
                <li key={meal.id} className="flex items-center gap-3 border-t border-secondary pt-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{foodName}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span title={formatFedAt(meal.fed_at)}>{formatTimeAgo(meal.fed_at, now)}</span>
                      <span>{formatWeight(meal.portion_g)}</span>
                      <RateStars rate={meal.rate} />
                      {!meal.tolerated && <span className="font-semibold text-destructive">реакция</span>}
                    </p>
                    {(meal.reactions || meal.notes) && (
                      <p className="mt-0.5 truncate text-xs">{[meal.reactions, meal.notes].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                  {foods !== null && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Изменить кормление: ${foodName}, ${formatFedAt(meal.fed_at)}`}
                      className="text-muted-foreground"
                      onClick={() => setEditing(meal)}
                    >
                      <PencilIcon aria-hidden="true" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {meals && meals.length > RECENT_MEALS_LIMIT && (
          <Button type="button" variant="ghost" className="self-start" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Свернуть" : `Показать все (${meals.length})`}
          </Button>
        )}
      </Card>
    </>
  );
}
