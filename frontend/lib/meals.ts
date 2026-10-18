import { apiFetch } from "@/lib/api";
import type { Food } from "@/lib/foods";

export type Meal = {
  id: number;
  pet_id: number;
  // null, если корм удалили из списка; food_name при этом сохраняется
  food_id: number | null;
  food_name: string;
  amount_grams: number | null;
  fed_at: string;
  liked: boolean;
  tolerated: boolean;
  // Тип реакции; бывает только при tolerated = false
  digestive_reaction: boolean;
  allergic_reaction: boolean;
  reaction_notes: string | null;
  notes: string | null;
  created_at: string;
};

export type MealCreate = {
  food_id: number;
  // Обязателен при food_id: бэкенд списывает этот объём из остатка корма
  amount_grams: number;
  fed_at: string;
  liked: boolean;
  tolerated: boolean;
  digestive_reaction?: boolean;
  allergic_reaction?: boolean;
  reaction_notes?: string | null;
  notes?: string | null;
};

export type MealUpdate = Partial<MealCreate>;

export type MealSuggestion = {
  food_id: number;
  previously_tried: boolean;
  // Значения из последнего приёма этого корма питомцем
  suggested_values: Pick<Meal, "liked" | "tolerated"> | null;
};

function mealsPath(petId: number) {
  return `/api/v1/pets/${petId}/feeding-records`;
}

export function listMeals(petId: number) {
  return apiFetch<Meal[]>(mealsPath(petId), { method: "GET", auth: true });
}

export function createMeal(petId: number, data: MealCreate) {
  return apiFetch<Meal>(mealsPath(petId), { method: "POST", body: data, auth: true });
}

export function updateMeal(petId: number, mealId: number, data: MealUpdate) {
  return apiFetch<Meal>(`${mealsPath(petId)}/${mealId}`, { method: "PATCH", body: data, auth: true });
}

export function deleteMeal(petId: number, mealId: number) {
  return apiFetch<void>(`${mealsPath(petId)}/${mealId}`, { method: "DELETE", auth: true });
}

export function getMealSuggestion(petId: number, foodId: number) {
  const query = new URLSearchParams({ food_id: String(foodId) });
  return apiFetch<MealSuggestion>(`${mealsPath(petId)}/suggestions?${query}`, {
    method: "GET",
    auth: true,
  });
}

// Короткие подписи типов реакций для истории и текста симптома
export function reactionLabels(meal: Pick<Meal, "digestive_reaction" | "allergic_reaction">): string[] {
  return [meal.digestive_reaction && "ЖКТ", meal.allergic_reaction && "аллергия"].filter(
    (label): label is string => Boolean(label),
  );
}

export function hasReactionType(meal: Pick<Meal, "digestive_reaction" | "allergic_reaction">): boolean {
  return meal.digestive_reaction || meal.allergic_reaction;
}

export function reactionSymptomText(meal: Meal): string {
  const types = [
    meal.digestive_reaction && "проблемы с ЖКТ",
    meal.allergic_reaction && "аллергическая реакция",
  ].filter(Boolean).join(", ");
  const details = meal.reaction_notes ? ` — ${meal.reaction_notes}` : "";
  return `Реакция на корм «${meal.food_name}»: ${types}${details}`;
}

// Переносит реакцию из кормления в симптомы карты здоровья (по явному действию пользователя)
export function recordReactionAsSymptom(petId: number, meal: Meal) {
  return apiFetch<{ id: number; description: string; observed_at: string }>(
    `/api/v1/pets/${petId}/symptoms`,
    {
      method: "POST",
      body: { description: reactionSymptomText(meal), observed_at: meal.fed_at },
      auth: true,
    },
  );
}

export function sortMeals(meals: Meal[]): Meal[] {
  return [...meals].sort((a, b) => b.fed_at.localeCompare(a.fed_at) || b.id - a.id);
}

export type RankedFood = {
  food: Food;
  // Доля приёмов, когда корм понравился; null, если ещё не пробовал
  likedShare: number | null;
  intolerant: boolean;
  allergic: boolean;
};

// Порядок в списке выбора: есть в наличии → нравится чаще → ещё не пробовал → плохо переносит
export function rankFoods(foods: Food[], meals: Meal[]): RankedFood[] {
  const ranked = foods.map((food) => {
    const history = meals.filter((meal) => meal.food_id === food.id);
    return {
      food,
      likedShare: history.length ? history.filter((meal) => meal.liked).length / history.length : null,
      intolerant: history.some((meal) => !meal.tolerated),
      allergic: history.some((meal) => meal.allergic_reaction),
    };
  });
  const score = ({ food, likedShare, intolerant }: RankedFood) =>
    (food.remaining_grams > 0 ? 0 : 100) + (intolerant ? 50 : 0) + (likedShare === null ? 0.5 : 1 - likedShare);
  return ranked.sort((a, b) => score(a) - score(b));
}

const relativeTime = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });

export function formatTimeAgo(date: string, now: number): string {
  const minutes = Math.round((now - new Date(date).getTime()) / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return relativeTime.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return relativeTime.format(-hours, "hour");
  return relativeTime.format(-Math.round(hours / 24), "day");
}
