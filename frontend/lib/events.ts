import { apiFetch } from "@/lib/api";
import { timezone } from "@/lib/health";

export type CalendarEventType = "visit" | "vaccination" | "medication" | "parasite" | "birthday";

// Ответ GET /api/v1/calendar/events
export type CalendarEvent = {
  id: string;
  type: CalendarEventType;
  pet_id: number;
  pet_name: string;
  title: string;
  detail: string | null;
  date: string;
  time: string | null;
  status: string;
  source_id: number;
};

export type CalendarEventQuery = {
  from?: string;
  to?: string;
  petId?: number;
  types?: CalendarEventType[];
};

export type UpcomingQuery = {
  days?: number;
  limit?: number;
  petId?: number;
};

// Событие, готовое к отрисовке в дашборде: единый формат для визитов,
// прививок и приёмов лекарств.
export type PetEvent = {
  id: string;
  petId: number;
  petName: string;
  type: CalendarEventType;
  title: string;
  detail: string | null;
  date: string;
  time: string | null;
  done: boolean;
};

const DONE_STATUS: Record<CalendarEventType, string> = {
  visit: "completed",
  vaccination: "done",
  medication: "taken",
  // У обработки от паразитов в календаре только плановые даты следующей обработки.
  parasite: "done",
  // Прошедший день рождения в API имеет статус past.
  birthday: "past",
};

const PAST_DAYS = 30;
const FUTURE_DAYS = 42;

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// Диапазон по умолчанию: недавнее прошлое (просроченные дела) и полная сетка месяца.
function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - PAST_DAYS);
  const to = new Date(today);
  to.setDate(to.getDate() + FUTURE_DAYS);
  return { from: dateKey(from), to: dateKey(to) };
}

export async function listCalendarEvents(query: CalendarEventQuery = {}): Promise<CalendarEvent[]> {
  const range = defaultRange();
  const params = new URLSearchParams({
    from: query.from ?? range.from,
    to: query.to ?? range.to,
    tz: timezone(),
  });
  if (query.petId !== undefined) params.set("pet_id", String(query.petId));
  for (const type of query.types ?? []) params.append("type", type);

  return apiFetch<CalendarEvent[]>(`/api/v1/calendar/events?${params}`, {
    method: "GET",
    auth: true,
  });
}

export async function listUpcomingEvents(query: UpcomingQuery = {}): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({ tz: timezone() });
  if (query.days !== undefined) params.set("days", String(query.days));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.petId !== undefined) params.set("pet_id", String(query.petId));

  return apiFetch<CalendarEvent[]>(`/api/v1/calendar/upcoming?${params}`, {
    method: "GET",
    auth: true,
  });
}

// Собирает локальные дату и время, чтобы new Date(...) не сдвигал день из-за UTC.
export function toPetEvent(event: CalendarEvent): PetEvent {
  return {
    id: event.id,
    petId: event.pet_id,
    petName: event.pet_name,
    type: event.type,
    title: event.title,
    detail: event.detail,
    date: `${event.date}T${event.time ?? "00:00:00"}`,
    time: event.time,
    done: event.status === DONE_STATUS[event.type],
  };
}

export async function listEvents(query?: CalendarEventQuery): Promise<PetEvent[]> {
  const events = await listCalendarEvents(query);
  return events
    // Пропущенные приёмы лекарств не показываем: они не требуют действия.
    .filter((event) => event.type !== "medication" || event.status !== "skipped")
    .map(toPetEvent);
}
