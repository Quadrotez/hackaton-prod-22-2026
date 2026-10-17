import { apiFetch } from "@/lib/api";

export type FoodType = "dry" | "wet" | "treat";

// Корма общие для всех питомцев пользователя. БЖУ и калории — на 100 г.
export type Food = {
  id: number;
  name: string;
  description: string | null;
  type: FoodType;
  protein: number;
  fats: number;
  carbohydrates: number;
  calories: number;
  total_g: number;
  // Бэк списывает portion_g при создании приёма пищи и возвращает при удалении; ниже 0 не опускается
  remaining_g: number;
  // Средний суточный расход по всем питомцам за последние 14 дней; null, если приёмов не было
  avg_daily_g: number | null;
  created_at: string;
};

export type FoodCreate = Omit<Food, "id" | "avg_daily_g" | "created_at">;

export type FoodUpdate = Partial<FoodCreate>;

export const foodTypeLabels: Record<FoodType, string> = {
  dry: "Сухой",
  wet: "Влажный",
  treat: "Лакомство",
};

const LOW_STOCK_DAYS = 7;

export function getDaysLeft(food: Pick<Food, "remaining_g" | "avg_daily_g">): number | null {
  if (!food.avg_daily_g) return null;
  return Math.floor(food.remaining_g / food.avg_daily_g);
}

export function isLowStock(food: Pick<Food, "remaining_g" | "avg_daily_g">): boolean {
  const daysLeft = getDaysLeft(food);
  return food.remaining_g <= 0 || (daysLeft !== null && daysLeft < LOW_STOCK_DAYS);
}

const FOODS_PATH = "/api/v1/foods";

export function listFoods() {
  return apiFetch<Food[]>(FOODS_PATH, { method: "GET", auth: true });
}

export function createFood(data: FoodCreate) {
  return apiFetch<Food>(FOODS_PATH, { method: "POST", body: data, auth: true });
}

export function updateFood(foodId: number, data: FoodUpdate) {
  return apiFetch<Food>(`${FOODS_PATH}/${foodId}`, { method: "PATCH", body: data, auth: true });
}

export function deleteFood(foodId: number) {
  return apiFetch<void>(`${FOODS_PATH}/${foodId}`, { method: "DELETE", auth: true });
}
