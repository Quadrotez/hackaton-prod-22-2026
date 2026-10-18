import { apiFetch } from "@/lib/api";
import { getPet, listPets } from "@/lib/pets";
import { toDateKey, type CalendarEvent } from "@/lib/health-events";

export type HealthView = "observations" | "plan" | "history";
export type Visit = {
  id: number; pet_id: number; title: string; visit_at: string;
  reason: "illness" | "examination" | "vaccination" | "checkup";
  status: "planned" | "completed" | "cancelled";
  doctor_name: string | null; doctor_specialty: string | null;
  topic: string | null; diagnosis: string | null; notes: string | null;
};
export type Vaccination = {
  id: number; pet_id: number; name: string; scheduled_on: string;
  status: "planned" | "done"; clinic: string | null; notes: string | null;
};
export type Medication = {
  id: number; pet_id: number; name: string; dose: string;
  start_date: string; end_date: string | null; interval_days: number;
  times: string[]; notes: string | null;
};
export type Symptom = { id: number; description: string; observed_at: string };
export type ParasiteTreatment = {
  id: number; pet_id: number; kind: "internal" | "external"; product_name: string;
  treated_on: string; interval_days: number | null; next_due_on: string | null;
  clinic: string | null; notes: string | null;
};
export type Allergy = { id: number; allergen: string; reactions: string | null; notes: string | null };
export type Pregnancy = { id: number; month: number; started_on: string; ended_on: string | null };
export type MeasurementParameter = {
  id: number; name: string; unit: string | null;
  latest: { value: number; measured_at: string } | null;
  change: number | null;
  recent: { value: number; measured_at: string }[];
};
export type Dose = {
  medication_id: number; name: string; dose: string; scheduled_for: string;
  status: "pending" | "taken" | "skipped";
};
type Overview = { measurements: MeasurementParameter[]; pregnancy: Pregnancy | null };
export type HealthData = Awaited<ReturnType<typeof loadHealth>>;
export const healthPath = (petId: number, path: string) => `/api/v1/pets/${petId}/${path}`;
export const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export async function loadHealth(petId: number) {
  const [pet, overview, visits, vaccinations, medications, symptoms, allergies] = await Promise.all([
    getPet(petId),
    apiFetch<Overview>(healthPath(petId, `health?tz=${encodeURIComponent(timezone())}`), { auth: true }),
    apiFetch<Visit[]>(healthPath(petId, "visits"), { auth: true }),
    apiFetch<Vaccination[]>(healthPath(petId, "vaccinations"), { auth: true }),
    apiFetch<Medication[]>(healthPath(petId, "medications"), { auth: true }),
    apiFetch<Symptom[]>(healthPath(petId, "symptoms"), { auth: true }),
    apiFetch<Allergy[]>(healthPath(petId, "allergies"), { auth: true }),
  ]);
  return { pet, visits, vaccinations, medications, symptoms, allergies, ...overview, today: toDateKey(new Date()) };
}

type ApiCalendarEvent = {
  id: string;
  type: "visit" | "vaccination" | "medication" | "parasite" | "birthday";
  pet_id: number;
  pet_name: string;
  title: string;
  detail: string | null;
  date: string;
  time: string | null;
  status: string;
  source_id: number;
};

export async function loadCalendar(from: string, to: string, petId?: number) {
  const params = new URLSearchParams({ from, to, tz: timezone() });
  if (petId !== undefined) params.set("pet_id", String(petId));
  const [pets, records] = await Promise.all([
    listPets(),
    apiFetch<ApiCalendarEvent[]>(`/api/v1/calendar/events?${params}`, { auth: true }),
  ]);
  const kinds = { visit: "visit", vaccination: "vaccine", medication: "medicine", parasite: "parasite", birthday: "birthday" } as const;
  const events = records.filter((record) => record.status !== "skipped").map((record): CalendarEvent => {
    const kind = kinds[record.type];
    const completed = ["completed", "done", "taken", "past"].includes(record.status);
    return {
      key: `${record.pet_id}-${record.id}`,
      recordKey: `${kind}-${record.source_id}`,
      petId: record.pet_id,
      petName: record.pet_name,
      kind,
      title: record.title,
      date: record.date,
      time: record.time?.slice(0, 5) ?? "",
      completed,
      view: completed && (kind === "visit" || kind === "vaccine") ? "history" : "plan",
    };
  });
  return { events: events.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)), range: `${from}/${to}`, petId: petId ?? null, pets };
}

export function saveHealth(petId: number, path: string, body: unknown, method: "POST" | "PATCH" | "PUT" = "POST") {
  return apiFetch(healthPath(petId, path), { method, body, auth: true });
}
export function deleteHealth(petId: number, path: string) {
  return apiFetch<void>(healthPath(petId, path), { method: "DELETE", auth: true });
}
