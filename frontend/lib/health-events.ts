import type { Dose, HealthView, ParasiteTreatment, Visit, Vaccination } from "./health";

export type CalendarEvent = {
  key: string; recordKey: string; petId: number; petName: string;
  kind: "visit" | "vaccine" | "medicine" | "parasite"; title: string;
  date: string; time: string; completed: boolean; view: HealthView;
};
export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function localDateTime(value: string) {
  // API возвращает даты визитов в UTC, расписание доз — в местном времени без offset.
  return new Date(value);
}
export function calendarEvents(
  pet: { id: number; name: string }, visits: Visit[], vaccinations: Vaccination[], doses: Dose[],
  parasites: ParasiteTreatment[] = [],
): CalendarEvent[] {
  const common = { petId: pet.id, petName: pet.name };
  return [
    ...visits.filter((visit) => visit.status !== "cancelled").map((visit): CalendarEvent => {
      const date = localDateTime(visit.visit_at);
      return { ...common, key: `${pet.id}-visit-${visit.id}`, recordKey: `visit-${visit.id}`, kind: "visit", title: visit.title,
        date: toDateKey(date), time: date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        completed: visit.status === "completed", view: visit.status === "completed" ? "history" : "plan" };
    }),
    ...vaccinations.map((vaccine): CalendarEvent => ({ ...common, key: `${pet.id}-vaccine-${vaccine.id}`, recordKey: `vaccine-${vaccine.id}`,
      kind: "vaccine", title: vaccine.name, date: vaccine.scheduled_on, time: "", completed: vaccine.status === "done", view: vaccine.status === "done" ? "history" : "plan" })),
    ...doses.filter((dose) => dose.status !== "skipped").map((dose): CalendarEvent => ({ ...common,
      key: `${pet.id}-medicine-${dose.medication_id}-${dose.scheduled_for}`, recordKey: `medicine-${dose.medication_id}`,
      kind: "medicine", title: dose.name, date: dose.scheduled_for.slice(0, 10), time: dose.scheduled_for.slice(11, 16),
      completed: dose.status === "taken", view: "plan" })),
    ...parasites.filter((treatment) => treatment.next_due_on).map((treatment): CalendarEvent => ({ ...common,
      key: `${pet.id}-parasite-${treatment.id}`, recordKey: `parasite-${treatment.id}`, kind: "parasite",
      title: treatment.product_name, date: treatment.next_due_on as string, time: "", completed: false, view: "plan" })),
  ];
}
export function healthEventHref(event: CalendarEvent) {
  const section = { visit: "visits", vaccine: "vaccines", medicine: "medicines", parasite: "parasites" }[event.kind];
  return `/pet/${event.petId}/health/${section}#health-${event.recordKey}`;
}
