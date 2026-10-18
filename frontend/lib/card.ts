import type { Food, FoodType } from "@/lib/foods";

export type FoodFilter = "all" | FoodType;

export type FoodCardProps = {
  food: Food;
};
