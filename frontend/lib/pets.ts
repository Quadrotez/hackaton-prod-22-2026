import { Cat, Dog, PawPrint, type LucideIcon } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { notifyPetsChanged, PETS_CHANGED_EVENT } from "@/lib/pets-changed";

export type PetSex = "boy" | "girl";

export type Pet = {
  id: number;
  name: string;
  species: string;
  sex: PetSex;
  breed: string | null;
  birth_date: string | null;
  approximate_age_years: number | null;
  weight_g: number | null;
  photo_url: string | null;
  // "caretaker": the pet is in the user's temporary care — reading and adding care records only.
  access?: PetAccess;
  care_transfer_id?: number | null;
  care_ends_at?: string | null;
  owner_name?: string | null;
};

export type PetAccess = "owner" | "caretaker";

export function isCaretaker(pet: Pick<Pet, "access">): boolean {
  return pet.access === "caretaker";
}

export { PETS_CHANGED_EVENT };

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

export const sexOptions: { value: PetSex; label: string }[] = [
  { value: "boy", label: "Мальчик" },
  { value: "girl", label: "Девочка" },
];

function findSpecies(species: string) {
  return speciesOptions.find((option) => option.value === species && option.value !== "other");
}

export function getSpeciesLabel(species: string): string {
  return findSpecies(species)?.label ?? species;
}

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

export function formatPetSummary(pet: Pick<Pet, "species" | "breed" | "birth_date" | "approximate_age_years">): string {
  return [getSpeciesLabel(pet.species), pet.breed, formatPetAge(pet)].filter(Boolean).join(" · ");
}

export function formatWeight(weightG: number): string {
  if (weightG < 1000) return `${weightG} г`;
  return `${(weightG / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`;
}

export async function listPets(): Promise<Pet[]> {
  return apiFetch<Pet[]>("/api/v1/pets/", {
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
  const pet = await apiFetch<Pet>("/api/v1/pets/", {
    method: "POST",
    body: data,
    auth: true,
  });
  notifyPetsChanged();
  return pet;
}

export async function updatePet(petId: number, data: PetUpdate): Promise<Pet> {
  const pet = await apiFetch<Pet>(`/api/v1/pets/${petId}`, {
    method: "PATCH",
    body: data,
    auth: true,
  });
  notifyPetsChanged();
  return pet;
}

export async function deletePet(petId: number): Promise<void> {
  return apiFetch<void>(`/api/v1/pets/${petId}`, {
    method: "DELETE",
    auth: true,
  });
  notifyPetsChanged();
}

export function petPhotoPath(petId: number): string {
  return `/api/v1/pets/${petId}/photo`;
}

export async function uploadPetPhoto(petId: number, file: File | Blob): Promise<Pet> {
  const formData = new FormData();
  formData.append("file", file);

  const pet = await apiFetch<Pet>(petPhotoPath(petId), {
    method: "POST",
    body: formData,
    auth: true,
  });
  notifyPetsChanged();
  return pet;
}

export type PetShare = {
  id: number;
  email: string;
  created_at: string;
  expires_at: string;
};

export type PetShareCreate = {
  email: string;
  expires_in_hours: number;
};

export const durationOptions = [
  { hours: 24, label: "24 часа" },
  { hours: 72, label: "3 дня" },
  { hours: 168, label: "7 дней" },
  { hours: 720, label: "30 дней" },
] as const;

export function isActive(share: PetShare): boolean {
  return new Date(share.expires_at).getTime() > Date.now();
}

export function formatExpiry(iso: string): string {
  return `до ${new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export const listShares = (petId: number) =>
  apiFetch<PetShare[]>(`/api/v1/pets/${petId}/shares`, { method: "GET", auth: true });

export const createShare = (petId: number, data: PetShareCreate) =>
  apiFetch<PetShare>(`/api/v1/pets/${petId}/shares`, { method: "POST", body: data, auth: true });

export const deleteShare = (petId: number, shareId: number) =>
  apiFetch<void>(`/api/v1/pets/${petId}/shares/${shareId}`, { method: "DELETE", auth: true });