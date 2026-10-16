import { Cat, Dog, PawPrint, type LucideIcon } from "lucide-react";
import { apiFetch } from "@/lib/api";

export type PetSex = "boy" | "girl";

export const sexOptions: { value: PetSex; label: string }[] = [
  { value: "boy", label: "Мальчик" },
  { value: "girl", label: "Девочка" },
];

export function getSexLabel(sex: PetSex): string {
  return sexOptions.find((option) => option.value === sex)?.label ?? sex;
}

export type Pet = {
  id: number;
  name: string;
  species: string;
  sex: PetSex;
  breed: string | null;
  birth_date: string | null;
  approximate_age_years: number | null;
  // null только у питомцев, созданных до появления веса
  weight_g: number | null;
  photo_url: string | null;
};

// birth_date и approximate_age_years взаимоисключающие; оба можно не передавать
export type PetCreate = {
  name: string;
  species: string;
  sex: PetSex;
  breed?: string | null;
  birth_date?: string | null;
  approximate_age_years?: number | null;
  weight_g: number;
};

export type PetUpdate = {
  name?: string;
  species?: string;
  sex?: PetSex;
  breed?: string | null;
  birth_date?: string | null;
  approximate_age_years?: number | null;
  weight_g?: number;
};

export const speciesOptions: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "cat", label: "Кошка", icon: Cat },
  { value: "dog", label: "Собака", icon: Dog },
  { value: "other", label: "Другой", icon: PawPrint },
];

function findSpecies(species: string) {
  return speciesOptions.find((option) => option.value === species && option.value !== "other");
}

export function getSpeciesLabel(species: string): string {
  return findSpecies(species)?.label ?? species;
}

// Произвольные виды (введённые вручную) отображаются как «Другой».
export function getSpeciesOption(species: string) {
  return findSpecies(species) ?? speciesOptions[speciesOptions.length - 1];
}

function getAgeYears(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function formatYears(years: number): string {
  if (years < 1) return "меньше года";
  return `${years} ${pluralize(years, "год", "года", "лет")}`;
}

export function formatPetAge(pet: Pick<Pet, "birth_date" | "approximate_age_years">): string | null {
  if (pet.birth_date) return formatYears(getAgeYears(pet.birth_date));
  if (pet.approximate_age_years != null) return `≈ ${formatYears(pet.approximate_age_years)}`;
  return null;
}

export function formatPetSummary(pet: Pick<Pet, "species" | "sex" | "breed" | "birth_date" | "approximate_age_years">): string {
  return [getSpeciesLabel(pet.species), getSexLabel(pet.sex), pet.breed, formatPetAge(pet)].filter(Boolean).join(" · ");
}

export function formatWeight(weightG: number): string {
  if (weightG < 1000) return `${weightG} г`;
  return `${(weightG / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`;
}

export async function listPets(): Promise<Pet[]> {
  return apiFetch<Pet[]>("/api/v1/pets", {
    method: "GET",
    auth: true,
  });
}

export async function getPet(petId: number): Promise<Pet> {
  return apiFetch<Pet>(`/api/v1/pets/${petId}`, {
    method: "GET",
    auth: true,
  });
}

export async function createPet(data: PetCreate): Promise<Pet> {
  return apiFetch<Pet>("/api/v1/pets", {
    method: "POST",
    body: data,
    auth: true,
  });
}

export async function updatePet(petId: number, data: PetUpdate): Promise<Pet> {
  return apiFetch<Pet>(`/api/v1/pets/${petId}`, {
    method: "PATCH",
    body: data,
    auth: true,
  });
}

export async function deletePet(petId: number): Promise<void> {
  return apiFetch<void>(`/api/v1/pets/${petId}`, {
    method: "DELETE",
    auth: true,
  });
}

export function petPhotoPath(petId: number): string {
  return `/api/v1/pets/${petId}/photo`;
}

export async function uploadPetPhoto(petId: number, file: File | Blob): Promise<Pet> {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch<Pet>(petPhotoPath(petId), {
    method: "POST",
    body: formData,
    auth: true,
  });
}
