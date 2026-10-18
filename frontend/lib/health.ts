import { apiFetch } from "@/lib/api";
import { getPet, listPets } from "@/lib/pets";
import { calendarEvents, toDateKey } from "@/lib/health-events";

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

export async function loadCalendar(from: string, to: string) {
  const pets = await listPets();
  // Не скрываем ошибку одного питомца: календарь не должен выглядеть пустым при сбое API.
  const groups = await Promise.all(pets.map(async (pet) => {
    const [visits, vaccinations, doses, parasites] = await Promise.all([
      apiFetch<Visit[]>(healthPath(pet.id, "visits"), { auth: true }),
      apiFetch<Vaccination[]>(healthPath(pet.id, "vaccinations"), { auth: true }),
      apiFetch<Dose[]>(healthPath(pet.id, `medications/schedule?${new URLSearchParams({ from, to, tz: timezone() })}`), { auth: true }),
      apiFetch<ParasiteTreatment[]>(healthPath(pet.id, "parasite-treatments"), { auth: true }),
    ]);
    return calendarEvents(pet, visits, vaccinations, doses, parasites);
  }));
  return { events: groups.flat().sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)), range: `${from}/${to}`, pets };
}

export function saveHealth(petId: number, path: string, body: unknown, method: "POST" | "PATCH" | "PUT" = "POST") {
  return apiFetch(healthPath(petId, path), { method, body, auth: true });
}
export function deleteHealth(petId: number, path: string) {
  return apiFetch<void>(healthPath(petId, path), { method: "DELETE", auth: true });
}
