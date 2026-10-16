export type FoodType = "dry" | "wet" | "treat";

export type FoodFilter = "all" | FoodType;

export type Food = {
  id: string;
  name: string;
  description: string;
  type: FoodType;
  protein: number;
  fats: number;
  carbohydrates: number;
  calories: number;
  remainingGrams: number;
  totalGrams: number;
};

export type FoodCardProps = {
  food: Food;
};

export type FoodCatalogProps = {
  foods: Food[];
};
