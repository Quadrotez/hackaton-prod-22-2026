import { ApiError, apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

export type Pet = {
  id: number;
  name: string;
  species: string;
  breed: string | null;
  birth_date: string | null;
  photo_url: string | null;
};

export type PetCreate = {
  name: string;
  species: string;
  breed?: string | null;
  birth_date?: string | null;
};

export type PetUpdate = {
  name?: string;
  species?: string;
  breed?: string | null;
  birth_date?: string | null;
};

function requireToken(token = getAccessToken()): string {
  if (!token) {
    throw new ApiError(401, "Not authenticated");
  }
  return token;
}

export async function listPets(token = getAccessToken()): Promise<Pet[]> {
  return apiFetch<Pet[]>("/api/v1/pets/", {
    method: "GET",
    token: requireToken(token),
  });
}

export async function getPet(
  petId: number,
  token = getAccessToken(),
): Promise<Pet> {
  return apiFetch<Pet>(`/api/v1/pets/${petId}`, {
    method: "GET",
    token: requireToken(token),
  });
}

export async function createPet(
  data: PetCreate,
  token = getAccessToken(),
): Promise<Pet> {
  return apiFetch<Pet>("/api/v1/pets/", {
    method: "POST",
    body: data,
    token: requireToken(token),
  });
}

export async function updatePet(
  petId: number,
  data: PetUpdate,
  token = getAccessToken(),
): Promise<Pet> {
  return apiFetch<Pet>(`/api/v1/pets/${petId}`, {
    method: "PATCH",
    body: data,
    token: requireToken(token),
  });
}

export async function deletePet(
  petId: number,
  token = getAccessToken(),
): Promise<void> {
  return apiFetch<void>(`/api/v1/pets/${petId}`, {
    method: "DELETE",
    token: requireToken(token),
  });
}

export async function uploadPetPhoto(
  petId: number,
  file: File | Blob,
  token = getAccessToken(),
): Promise<Pet> {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch<Pet>(`/api/v1/pets/${petId}/photo`, {
    method: "POST",
    body: formData,
    token: requireToken(token),
  });
}
