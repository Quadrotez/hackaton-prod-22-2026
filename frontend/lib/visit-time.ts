// Время приёма может быть неизвестно (например, в документе только дата).
// Договорённость с API: visit_at ровно в 00:00:00 UTC означает «только дата».
// Настоящее время, которое в UTC попадает ровно на полночь (03:00 по Москве),
// отправляем с одной секундой, чтобы бэкенд не принял его за «время не указано».

const DATE_ONLY_SUFFIX = "T00:00:00.000Z";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isDateOnlyVisit(visitAt: string) {
  const date = new Date(visitAt);
  return !Number.isNaN(date.getTime()) && date.toISOString().endsWith(DATE_ONLY_SUFFIX);
}

/** Дата визита YYYY-MM-DD: у визита без времени — дата из UTC, иначе местная. */
export function visitDateKey(visitAt: string) {
  const date = new Date(visitAt);
  return isDateOnlyVisit(visitAt) ? date.toISOString().slice(0, 10) : localDateKey(date);
}

/** Местное время HH:MM или пустая строка, если время не указано. */
export function visitTimeText(visitAt: string) {
  if (isDateOnlyVisit(visitAt)) return "";
  const date = new Date(visitAt);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** visit_at для API из даты формы и местного времени (null — «время не указано»). */
export function visitAtPayload(date: string, time: string | null) {
  if (!time) return `${date}${DATE_ONLY_SUFFIX}`;
  const moment = new Date(`${date}T${time}`);
  if (moment.toISOString().endsWith(DATE_ONLY_SUFFIX)) moment.setTime(moment.getTime() + 1000);
  return moment.toISOString();
}

/** Значения полей формы для сохранённого визита. */
export function visitFormValues(visitAt: string) {
  const unknown = isDateOnlyVisit(visitAt);
  return {
    visit_date: visitDateKey(visitAt),
    visit_time: unknown ? "" : visitTimeText(visitAt),
    visit_time_unknown: unknown ? "on" : "",
  };
}

/** «22 октября 2026 г., 11:30» или «17 октября 2026 г.» для визита без времени. */
export function formatVisitAt(visitAt: string) {
  if (isDateOnlyVisit(visitAt)) {
    return new Date(`${visitDateKey(visitAt)}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }
  return new Date(visitAt).toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
