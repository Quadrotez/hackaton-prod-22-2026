import { apiFetch, apiFetchBlob } from "@/lib/api";
import { timezone } from "@/lib/health";

// Ответ GET /api/v1/calendar/feed: сама ссылка не возвращается, токен хранится только хешем.
export type CalendarFeedStatus = {
  active: boolean;
  timezone: string | null;
  created_at: string | null;
};

// Ответ POST /api/v1/calendar/feed: path показывается один раз.
export type CalendarFeedLink = CalendarFeedStatus & { path: string };

export async function getCalendarFeed(): Promise<CalendarFeedStatus> {
  return apiFetch<CalendarFeedStatus>("/api/v1/calendar/feed", { method: "GET", auth: true });
}

// Создаёт ссылку-подписку; если она уже была, старая перестаёт работать.
export async function createCalendarFeed(): Promise<CalendarFeedLink> {
  return apiFetch<CalendarFeedLink>("/api/v1/calendar/feed", {
    method: "POST",
    auth: true,
    body: { timezone: timezone() },
  });
}

export async function deleteCalendarFeed(): Promise<void> {
  return apiFetch<void>("/api/v1/calendar/feed", { method: "DELETE", auth: true });
}

// Разовая выгрузка: эндпоинт требует токен, поэтому качаем через fetch, а не ссылкой.
export async function downloadCalendarFile(): Promise<void> {
  const params = new URLSearchParams({ tz: timezone() });
  const blob = await apiFetchBlob(`/api/v1/calendar/export.ics?${params}`, {
    method: "GET",
    auth: true,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "petcare.ics";
  link.click();
  // Освобождаем после старта загрузки: мгновенный revoke в части браузеров её обрывает.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function feedUrls(path: string): { https: string; webcal: string } {
  const https = new URL(path, window.location.origin).toString();
  return { https, webcal: https.replace(/^https?:/, "webcal:") };
}
