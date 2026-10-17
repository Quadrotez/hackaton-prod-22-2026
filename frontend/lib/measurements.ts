import { apiFetch } from "@/lib/api";
import { getPet } from "@/lib/pets";
import { getPetWeightHistory } from "@/lib/pet-weight";

export type MeasurementPoint = { value: number; measured_at: string };
export type Measurement = MeasurementPoint & {
  id: number;
  parameter_id: number;
  notes: string | null;
};
export type MeasurementParameter = {
  id: number;
  pet_id: number;
  name: string;
  unit: string | null;
  sort_order: number;
};
export type ParameterWithHistory = MeasurementParameter & { history: Measurement[] };

const parametersPath = (petId: number) => `/api/v1/pets/${petId}/measurement-parameters`;
const seriesPath = (petId: number, parameterId: number) => `${parametersPath(petId)}/${parameterId}/measurements`;

export function listMeasurementParameters(petId: number) {
  return apiFetch<MeasurementParameter[]>(parametersPath(petId), { auth: true });
}
export function listMeasurements(petId: number, parameterId: number) {
  return apiFetch<Measurement[]>(seriesPath(petId, parameterId), { auth: true });
}
export function addMeasurementParameter(petId: number, data: { name: string; unit: string | null }) {
  return apiFetch<MeasurementParameter>(parametersPath(petId), { method: "POST", body: data, auth: true });
}
export function renameMeasurementParameter(petId: number, parameterId: number, name: string) {
  return apiFetch<MeasurementParameter>(`${parametersPath(petId)}/${parameterId}`, { method: "PATCH", body: { name }, auth: true });
}
export function deleteMeasurementParameter(petId: number, parameterId: number) {
  return apiFetch<void>(`${parametersPath(petId)}/${parameterId}`, { method: "DELETE", auth: true });
}
export function saveMeasurement(petId: number, parameterId: number, data: MeasurementPoint, measurementId?: number) {
  return apiFetch<Measurement>(`${seriesPath(petId, parameterId)}${measurementId === undefined ? "" : `/${measurementId}`}`, {
    method: measurementId === undefined ? "POST" : "PATCH", body: data, auth: true,
  });
}
export async function loadMeasurementParameters(petId: number) {
  const [pet, parameters] = await Promise.all([getPet(petId), listMeasurementParameters(petId)]);
  return { pet, parameters: parameters.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id) };
}
export async function loadMeasurements(petId: number) {
  const [{ pet, parameters }, weights] = await Promise.all([loadMeasurementParameters(petId), getPetWeightHistory(petId)]);
  const withHistory: ParameterWithHistory[] = await Promise.all(parameters.map(async (parameter) => ({
    ...parameter,
    history: (await listMeasurements(petId, parameter.id)).sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at) || a.id - b.id),
  })));
  return { pet, parameters: withHistory, weights: weights.sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at) || a.id - b.id) };
}
export type MeasurementsData = Awaited<ReturnType<typeof loadMeasurements>>;
export type MeasurementParametersData = Awaited<ReturnType<typeof loadMeasurementParameters>>;
export const measurementNumber = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
export const measurementValue = (value: number, unit: string | null) => `${measurementNumber(value)}${unit ? ` ${unit}` : ""}`;
