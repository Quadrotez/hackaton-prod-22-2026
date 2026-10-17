import { apiFetch } from "@/lib/api";

export type PetWeight = {
  id: number;
  pet_id: number;
  weight_g: number;
  measured_at: string;
};

export function getPetWeightHistory(petId: number): Promise<PetWeight[]> {
  return apiFetch<PetWeight[]>(`/api/v1/pets/${petId}/weight`, { auth: true });
}

export function weightChartData(history: PetWeight[]) {
  return history
    .map((measurement) => ({
      id: measurement.id,
      timestamp: new Date(measurement.measured_at).getTime(),
      weight: measurement.weight_g / 1000,
    }))
    .sort((first, second) => first.timestamp - second.timestamp || first.id - second.id);
}
