"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import type { Food } from "@/lib/foods";
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
import { formatWeight } from "@/lib/pets";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const RECENT_MEALS_LIMIT = 2;
const DEFAULT_PORTION_GRAMS = 200;
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
  amount_grams: z.coerce.number().int("Укажите целое число граммов").positive("Укажите порцию больше 0 г"),
  fed_at: z.string().min(1, "Укажите время кормления")
    .transform((value) => new Date(value))
    .refine((date) => !Number.isNaN(date.getTime()), "Укажите корректное время")
    .refine((date) => date.getTime() <= Date.now() + FUTURE_TOLERANCE_MS, "Время кормления не может быть в будущем")
    .transform((date) => date.toISOString()),
  liked: z.boolean(),
  tolerated: z.boolean(),
  reaction_notes: z.string().trim().max(1000, "Не больше 1000 символов"),
  notes: z.string().trim().max(1000, "Не больше 1000 символов"),
});

type MealErrors = Partial<Record<keyof z.infer<typeof mealSchema>, string>>;

const choiceClass =
  "flex items-center justify-center rounded-lg border border-input px-2 py-2 text-sm transition-colors hover:bg-secondary/40 peer-checked:border-foreground/40 peer-checked:bg-secondary peer-focus-visible:ring-2 peer-focus-visible:ring-foreground";

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
  const [fedAt, setFedAt] = useState(() => toLocalInput(meal ? new Date(meal.fed_at) : new Date()));
  const [liked, setLiked] = useState(meal?.liked ?? true);
  const [tolerated, setTolerated] = useState(meal?.tolerated ?? true);
  const [suggestion, setSuggestion] = useState<MealSuggestion | null>(null);
  const [errors, setErrors] = useState<MealErrors>({});
  const [pending, setPending] = useState(false);
  const latestFoodId = useRef(foodId);
  const isEdit = meal !== undefined;
  const selected = foods.find((food) => String(food.id) === foodId);

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
        setLiked(result.suggested_values.liked);
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
      amount_grams: isEdit ? meal.amount_grams ?? DEFAULT_PORTION_GRAMS : formData.get("amount_grams"),
      fed_at: fedAt,
      liked,
      tolerated,
      reaction_notes: formData.get("reaction_notes") ?? "",
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

    if (!isEdit && selected && result.data.amount_grams > selected.remaining_grams) {
      setErrors({ amount_grams: `В наличии ${formatWeight(selected.remaining_grams)} — уменьшите порцию или пополните запас` });
      return;
    }

    setErrors({});
    setPending(true);
    try {
      const { amount_grams, ...fields } = result.data;
      const data = {
        ...fields,
        reaction_notes: result.data.reaction_notes || null,
        notes: result.data.notes || null,
      };
      const saved = isEdit ? await updateMeal(petId, meal.id, data) : await createMeal(petId, { ...data, amount_grams });
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
      toast.success("Запись удалена");
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
            <Select
              value={foodId || null}
              onValueChange={(value) => handleFoodChange(value ?? "")}
              items={ranked.map(({ food }) => ({ value: String(food.id), label: food.name }))}
              disabled={pending}
            >
              <SelectTrigger id="meal-food" aria-invalid={Boolean(errors.food_id)} className="w-full">
                <SelectValue placeholder="Выберите корм" />
              </SelectTrigger>
              <SelectContent>
                {ranked.map(({ food, likedShare, intolerant }) => {
                  const hint = [
                    intolerant ? "плохо переносит" : likedShare !== null ? `нравится в ${Math.round(likedShare * 100)}% случаев` : null,
                    food.remaining_grams <= 0 ? "закончился" : null,
                  ].filter(Boolean).join(" · ");
                  return (
                    <SelectItem key={food.id} value={String(food.id)}>
                      {food.name}
                      {hint && <span className={cn("text-xs", intolerant ? "text-destructive" : "text-muted-foreground")}>{hint}</span>}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selected && (
              <p className={cn("text-xs", selected.remaining_grams <= 0 ? "text-destructive" : "text-muted-foreground")}>
                {selected.remaining_grams <= 0 ? "Корм закончился" : `В наличии ${formatWeight(selected.remaining_grams)}`}
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

          {!isEdit && (
            <Field data-invalid={Boolean(errors.amount_grams)}>
              <FieldLabel htmlFor="meal-amount">Порция, г</FieldLabel>
              <Input
                id="meal-amount"
                name="amount_grams"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                defaultValue={DEFAULT_PORTION_GRAMS}
                aria-invalid={Boolean(errors.amount_grams)}
                aria-describedby="meal-amount-help meal-amount-error"
              />
              <p id="meal-amount-help" className="text-xs text-muted-foreground">Можно изменить перед сохранением.</p>
              <FieldError id="meal-amount-error">{errors.amount_grams}</FieldError>
            </Field>
          )}
          {isEdit && meal.amount_grams != null && <p className="text-sm text-muted-foreground">Порция: {formatWeight(meal.amount_grams)}</p>}

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
              <div className="flex flex-wrap gap-2.5 md:gap-1.5">
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

          <FieldSet className="gap-1">
            <FieldLegend variant="label">Понравилось?</FieldLegend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: true, label: "Да" },
                { value: false, label: "Нет" },
              ].map((option) => (
                <label key={String(option.value)}>
                  <input
                    type="radio"
                    name="liked"
                    checked={liked === option.value}
                    onChange={() => setLiked(option.value)}
                    className="peer sr-only"
                  />
                  <span className={choiceClass}>{option.label}</span>
                </label>
              ))}
            </div>
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

          <Field data-invalid={Boolean(errors.reaction_notes)}>
            <FieldLabel htmlFor="meal-reactions">Реакции животного</FieldLabel>
            <Input
              id="meal-reactions"
              name="reaction_notes"
              defaultValue={meal?.reaction_notes ?? ""}
              placeholder={tolerated ? "Необязательно" : "Рвота, зуд, вялость…"}
              maxLength={1000}
            />
            <FieldError>{errors.reaction_notes}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.notes)}>
            <FieldLabel htmlFor="meal-notes">Хотите ли что-то оставить в заметках?</FieldLabel>
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
  const visible = meals && (showAll ? meals : meals.slice(0, RECENT_MEALS_LIMIT));
  const knownMeals = meals ?? [];

  return (
    <>
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
              const foodName = meal.food_name;
              return (
                <li key={meal.id} className="flex items-center gap-3 border-t border-secondary pt-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{foodName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span title={formatFedAt(meal.fed_at)}>{formatTimeAgo(meal.fed_at, now)}</span>
                      {meal.amount_grams != null && ` · ${formatWeight(meal.amount_grams)}`}
                      {" · "}
                      {meal.liked ? "понравилось" : "не понравилось"}
                      {!meal.tolerated && (
                        <>
                          {" · "}
                          <span className="font-semibold text-destructive">реакция</span>
                        </>
                      )}
                      {[meal.reaction_notes, meal.notes].filter(Boolean).map((note) => ` · ${note}`).join("")}
                    </p>
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
          <Button type="button" variant="ghost" className="justify-center mt-2" onClick={() => setShowAll((value) => !value)}>
            {showAll ? <ChevronUpIcon /> : <ChevronDownIcon />}
            {showAll ? "Свернуть" : `Показать больше`}
          </Button>
        )}
      </Card>
    </>
  );
}
