import { apiFetch } from "@/lib/api";
import { getPet } from "@/lib/pets";
import { loadMeasurements } from "@/lib/measurements";

export const healthSections = {
  vaccines: { title: "Прививки", resource: "vaccinations" },
  parasites: { title: "Обработки", resource: "parasites" },
  visits: { title: "Приёмы", resource: "visits" },
  medicines: { title: "Лекарства", resource: "medications" },
  symptoms: { title: "Симптомы", resource: "symptoms" },
} as const;
export type HealthSection = keyof typeof healthSections;
export type Vaccine = { id: number; name: string; scheduled_on: string; status: "planned" | "done"; clinic: string | null; notes: string | null; interval_days: number | null; next_due_on: string | null };
export type Visit = {
  id: number; title: string; visit_at: string; status: "planned" | "completed" | "cancelled";
  reason: "illness" | "examination" | "vaccination" | "checkup"; topic: string | null;
  doctor_name: string | null; doctor_specialty: string | null; vet: string | null; visit_price: number | null;
  diagnosis: string | null; notes: string | null;
};
export type Medication = { id: number; name: string; dose: string; start_date: string; end_date: string | null; interval_days: number; times: string[]; notes: string | null };
export type Symptom = { id: number; description: string; observed_at: string };
export type ParasiteKind = "internal" | "external";
export type ParasiteTreatment = {
  id: number; pet_id: number; kind: ParasiteKind; product_name: string;
  treated_on: string; interval_days: number | null; next_due_on: string | null;
  clinic: string | null; notes: string | null; created_at: string;
};
export type Allergy = { id: number; allergen: string; reactions: string | null; notes: string | null; created_at: string };
export type Dose = { medication_id: number; name: string; dose: string; scheduled_for: string; status: "pending" | "taken" | "skipped" };
export type ResourceMap = { vaccinations: Vaccine; visits: Visit; medications: Medication; symptoms: Symptom; allergies: Allergy; parasites: ParasiteTreatment };
export type HealthResource = keyof ResourceMap;

// The caretaker UI only adds observations; treatment and appointments stay read-only.
export const CARETAKER_ADDABLE: readonly HealthResource[] = ["symptoms"];

export function canAddHealthRecord(pet: { access?: "owner" | "caretaker" }, resource: HealthResource): boolean {
  return pet.access !== "caretaker" || CARETAKER_ADDABLE.includes(resource);
}
export type HealthRecord = { [R in HealthResource]: { resource: R; value: ResourceMap[R] } }[HealthResource];
export type HealthSectionData = Awaited<ReturnType<typeof loadHealthSection>>;
export type Pregnancy = { id: number; pet_id: number; started_on: string; month: number; ended_on: string | null };
export type HealthOverview = { planned_visits: Visit[]; planned_vaccinations: Vaccine[]; symptoms_total: number; next_vaccination: Vaccine | null; next_parasite: ParasiteTreatment | null; pregnancy: Pregnancy | null };
export const healthPath = (petId: number, path: string) => `/api/v1/pets/${petId}/${path}`;
// URL-сегмент для каждого ресурса: у обработок он отличается от ключа ("parasites" → "parasite-treatments").
export const healthEndpoints: Record<HealthResource, string> = {
  vaccinations: "vaccinations", visits: "visits", medications: "medications",
  symptoms: "symptoms", allergies: "allergies", parasites: "parasite-treatments",
};
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
const DAY_MS = 24 * 60 * 60 * 1000;
export function dueBadge(next: string | null, today: string): string | null {
  if (!next) return null;
  const days = Math.round((new Date(`${next}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / DAY_MS);
  if (days < 0) return `просрочено ${-days} дн.`;
  if (days === 0) return "сегодня";
  return `через ${days} дн.`;
}
export async function listHealthRecords<R extends HealthResource>(petId: number, resource: R) {
  return apiFetch<ResourceMap[R][]>(healthPath(petId, healthEndpoints[resource]), { auth: true });
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
export type DoctorSummaryData = Awaited<ReturnType<typeof loadDoctorSummary>>;
// Сводка для врача: все записи здоровья, история веса и последние значения своих параметров.
export async function loadDoctorSummary(petId: number) {
  const [{ pet, overview }, vaccinations, visits, medications, symptoms, allergies, parasites, { parameters, weights }] = await Promise.all([
    loadHealthDashboard(petId),
    listHealthRecords(petId, "vaccinations"),
    listHealthRecords(petId, "visits"),
    listHealthRecords(petId, "medications"),
    listHealthRecords(petId, "symptoms"),
    listHealthRecords(petId, "allergies"),
    listHealthRecords(petId, "parasites"),
    loadMeasurements(petId),
  ]);
  return { pet, pregnancy: overview.pregnancy, vaccinations, visits, medications, symptoms, allergies, parasites, parameters, weights, today: dateKey(new Date()) };
}
export function saveHealthRecord(petId: number, resource: HealthResource, body: unknown, id?: number) {
  return apiFetch(healthPath(petId, `${healthEndpoints[resource]}${id === undefined ? "" : `/${id}`}`), { method: id === undefined ? "POST" : "PATCH", body, auth: true });
}
export function deleteHealthRecord(petId: number, record: HealthRecord) {
  return apiFetch<void>(healthPath(petId, `${healthEndpoints[record.resource]}/${record.value.id}`), { method: "DELETE", auth: true });
}
// Срок беременности задаётся текущим месяцем (1–9): бэкенд сам отсчитывает дату начала.
export function savePregnancy(petId: number, month: number) {
  return apiFetch<Pregnancy>(healthPath(petId, "pregnancy"), { method: "PUT", body: { month }, auth: true });
}
export function endPregnancy(petId: number) {
  return apiFetch<void>(healthPath(petId, "pregnancy"), { method: "DELETE", auth: true });
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
    case "parasites": return record.value.product_name;
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
    case "parasites": return record.value.treated_on;
  }
}
export function recordIsHistory(record: HealthRecord, today: string) {
  switch (record.resource) {
    case "visits": return record.value.status !== "planned";
    case "vaccinations": return record.value.status === "done";
    case "medications": return record.value.end_date !== null && record.value.end_date < today;
    case "parasites": return true;
    default: return false;
  }
}

export type VetDocumentAnalysis = {
  status: "success" | "partial" | "error";
  visit_at: string | null;
  visit_reason: string | null;
  visit_price: number | null;
  veterinarian_name: string | null;
  veterinarian_profession: string | null;
  vet: string | null;
  post_visit_instructions: string | null;
  warnings: string[];
  error_code: "UNREADABLE_IMAGE" | "UNSUPPORTED_DOCUMENT" | "INSUFFICIENT_INPUT" | null;
};

export function analyzeVetDocument(petId: number, image: File, userText = ""): Promise<VetDocumentAnalysis> {
  const body = new FormData();
  body.append("image", image);
  // Расшифровка, которую пользователь ввёл сам, уходит вместе с фото как контекст (лимит бэкенда — 4000 символов).
  if (userText.trim()) body.append("pet_context", userText.trim().slice(0, 4000));
  return apiFetch<VetDocumentAnalysis>(healthPath(petId, "vet-documents/analyze"), { method: "POST", body, auth: true });
}
