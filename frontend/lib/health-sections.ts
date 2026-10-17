import { apiFetch } from "@/lib/api";
import { getPet } from "@/lib/pets";

export const healthSections = {
  vaccines: { title: "Прививки", resource: "vaccinations", description: "Плановые и сделанные прививки" },
  visits: { title: "Приёмы", resource: "visits", description: "Записи к врачу и история визитов" },
  medicines: { title: "Лекарства", resource: "medications", description: "Курсы, дозировки и расписание приёма" },
  symptoms: { title: "Симптомы", resource: "symptoms", description: "Наблюдения за питомцем и известные аллергии" },
} as const;
export type HealthSection = keyof typeof healthSections;
export type Vaccine = { id: number; name: string; scheduled_on: string; status: "planned" | "done"; clinic: string | null; notes: string | null };
export type Visit = {
  id: number; title: string; visit_at: string; status: "planned" | "completed" | "cancelled";
  reason: "illness" | "examination" | "vaccination" | "checkup"; topic: string | null;
  doctor_name: string | null; doctor_specialty: string | null; diagnosis: string | null; notes: string | null;
};
export type Medication = { id: number; name: string; dose: string; start_date: string; end_date: string | null; interval_days: number; times: string[]; notes: string | null };
export type Symptom = { id: number; description: string; observed_at: string };
export type Allergy = { id: number; allergen: string; reactions: string | null; notes: string | null; created_at: string };
export type Dose = { medication_id: number; name: string; dose: string; scheduled_for: string; status: "pending" | "taken" | "skipped" };
export type ResourceMap = { vaccinations: Vaccine; visits: Visit; medications: Medication; symptoms: Symptom; allergies: Allergy };
export type HealthResource = keyof ResourceMap;
export type HealthRecord = { [R in HealthResource]: { resource: R; value: ResourceMap[R] } }[HealthResource];
export type HealthSectionData = Awaited<ReturnType<typeof loadHealthSection>>;
export type HealthOverview = { planned_visits: Visit[]; planned_vaccinations: Vaccine[]; symptoms_total: number };
export const healthPath = (petId: number, path: string) => `/api/v1/pets/${petId}/${path}`;
export const localTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function datetimeInput(value: string) {
  const date = new Date(value);
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function formatHealthDate(value: string, time = false) {
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleString("ru-RU", {
    day: "numeric", month: "long", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
export async function listHealthRecords<R extends HealthResource>(petId: number, resource: R) {
  return apiFetch<ResourceMap[R][]>(healthPath(petId, resource), { auth: true });
}
export async function loadHealthDashboard(petId: number) {
  const [pet, overview] = await Promise.all([
    getPet(petId),
    apiFetch<HealthOverview>(healthPath(petId, `health?tz=${encodeURIComponent(localTimezone())}`), { auth: true }),
  ]);
  return { pet, overview };
}
export async function loadHealthSection(petId: number, section: HealthSection) {
  const now = new Date();
  const today = dateKey(now);
  const resource = healthSections[section].resource;
  const [pet, values, allergies, doses] = await Promise.all([
    getPet(petId),
    listHealthRecords(petId, resource),
    section === "symptoms" ? listHealthRecords(petId, "allergies") : Promise.resolve([]),
    section === "medicines" ? apiFetch<Dose[]>(healthPath(petId, `medications/schedule?${new URLSearchParams({ from: today, to: today, tz: localTimezone() })}`), { auth: true }) : Promise.resolve([]),
  ]);
  // resource определяет тип каждого ответа API, дополнительных полей для записей не храним.
  const records = values.map((value) => ({ resource, value }) as HealthRecord);
  records.push(...allergies.map((value): HealthRecord => ({ resource: "allergies", value })));
  return { pet, section, records, doses, today, now: now.toISOString() };
}
export function saveHealthRecord(petId: number, resource: HealthResource, body: unknown, id?: number) {
  return apiFetch(healthPath(petId, `${resource}${id === undefined ? "" : `/${id}`}`), { method: id === undefined ? "POST" : "PATCH", body, auth: true });
}
export function deleteHealthRecord(petId: number, record: HealthRecord) {
  return apiFetch<void>(healthPath(petId, `${record.resource}/${record.value.id}`), { method: "DELETE", auth: true });
}
export function markHealthDose(petId: number, dose: Dose, status: "taken" | "skipped") {
  return apiFetch(healthPath(petId, `medications/${dose.medication_id}/intakes?tz=${encodeURIComponent(localTimezone())}`), {
    method: "PUT", body: { scheduled_for: dose.scheduled_for, status }, auth: true,
  });
}
export function clearHealthDose(petId: number, dose: Dose) {
  return apiFetch<void>(healthPath(petId, `medications/${dose.medication_id}/intakes?${new URLSearchParams({ scheduled_for: dose.scheduled_for, tz: localTimezone() })}`), { method: "DELETE", auth: true });
}
export function recordTitle(record: HealthRecord) {
  switch (record.resource) {
    case "visits": return record.value.title;
    case "symptoms": return record.value.description;
    case "allergies": return record.value.allergen;
    default: return record.value.name;
  }
}
export function recordDate(record: HealthRecord) {
  switch (record.resource) {
    case "visits": return record.value.visit_at;
    case "vaccinations": return record.value.scheduled_on;
    case "medications": return record.value.start_date;
    case "symptoms": return record.value.observed_at;
    case "allergies": return record.value.created_at;
  }
}
export function recordIsHistory(record: HealthRecord, today: string) {
  switch (record.resource) {
    case "visits": return record.value.status !== "planned";
    case "vaccinations": return record.value.status === "done";
    case "medications": return record.value.end_date !== null && record.value.end_date < today;
    default: return false;
  }
}
