import { z } from "zod";
import { datetimeInput, type HealthRecord, type HealthResource, type HealthSectionData } from "@/lib/health";

const requiredText = (max: number) => z.string().trim().min(1, "Это обязательное поле").max(max, `Не больше ${max} символов`);
const optionalText = (max: number) => z.string().trim().max(max, `Не больше ${max} символов`).transform((value) => value || null);
const date = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Укажите корректную дату");
const datetime = z.string().refine((value) => value.length > 0 && !Number.isNaN(new Date(value).getTime()), "Укажите дату и время").transform((value) => new Date(value).toISOString());
export const healthSchemas = {
  vaccinations: z.object({ name: requiredText(255), scheduled_on: date, status: z.enum(["planned", "done"]), clinic: optionalText(255), notes: optionalText(2000) }),
  visits: z.object({
    title: requiredText(255), visit_at: datetime, reason: z.enum(["illness", "examination", "vaccination", "checkup"]),
    status: z.enum(["planned", "completed", "cancelled"]), doctor_name: optionalText(255), doctor_specialty: optionalText(255),
    topic: optionalText(255), diagnosis: optionalText(5000), notes: optionalText(5000),
  }),
  medications: z.object({
    name: requiredText(255), dose: requiredText(100), start_date: date,
    end_date: z.union([date, z.literal("")]).transform((value) => value || null),
    interval_days: z.coerce.number().int("Введите целое число дней").min(1, "Минимум один день").max(365, "Не больше 365 дней"),
    times: requiredText(100).transform((value) => value.split(",").map((item) => item.trim())).refine((values) => values.length <= 12 && values.every((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)), "Укажите время через запятую: 09:00, 18:00 (до 12 приёмов)"),
    notes: optionalText(2000),
  }).refine((data) => !data.end_date || data.end_date >= data.start_date, { path: ["end_date"], message: "Конец курса не может быть раньше начала" }),
  symptoms: z.object({ description: requiredText(2000), observed_at: datetime }),
  allergies: z.object({ allergen: requiredText(255), reactions: optionalText(2000), notes: optionalText(2000) }),
};
export type HealthField = {
  name: string; label: string; type?: "date" | "datetime-local" | "number" | "textarea";
  required?: boolean; maxLength?: number; min?: number; max?: number; placeholder?: string;
  options?: { value: string; label: string }[];
};
export const healthFields: Record<HealthResource, HealthField[]> = {
  vaccinations: [
    { name: "name", label: "Название прививки", required: true, maxLength: 255 },
    { name: "scheduled_on", label: "Дата", type: "date", required: true },
    { name: "status", label: "Статус", options: [{ value: "planned", label: "Запланирована" }, { value: "done", label: "Сделана" }] },
    { name: "clinic", label: "Клиника", maxLength: 255 }, { name: "notes", label: "Примечание", type: "textarea", maxLength: 2000 },
  ],
  visits: [
    { name: "title", label: "Название приёма", required: true, maxLength: 255, placeholder: "Например, плановый осмотр" },
    { name: "visit_at", label: "Дата и время", type: "datetime-local", required: true },
    { name: "reason", label: "Причина", options: [{ value: "examination", label: "Осмотр" }, { value: "illness", label: "Болезнь или жалоба" }, { value: "vaccination", label: "Вакцинация" }, { value: "checkup", label: "Контрольный приём" }] },
    { name: "status", label: "Статус", options: [{ value: "planned", label: "Запланирован" }, { value: "completed", label: "Состоялся" }, { value: "cancelled", label: "Отменён" }] },
    { name: "doctor_name", label: "Врач", maxLength: 255 }, { name: "doctor_specialty", label: "Специальность врача", maxLength: 255 },
    { name: "topic", label: "Жалоба или тема визита", maxLength: 255 },
    { name: "diagnosis", label: "Диагноз и заключение", type: "textarea", maxLength: 5000 }, { name: "notes", label: "Примечание", type: "textarea", maxLength: 5000 },
  ],
  medications: [
    { name: "name", label: "Лекарство", required: true, maxLength: 255 }, { name: "dose", label: "Дозировка", required: true, maxLength: 100, placeholder: "Например, 1 таблетка" },
    { name: "start_date", label: "Начало курса", type: "date", required: true }, { name: "end_date", label: "Окончание курса (необязательно)", type: "date" },
    { name: "times", label: "Время приёма", required: true, maxLength: 100, placeholder: "09:00, 18:00" },
    { name: "interval_days", label: "Интервал, дней", type: "number", min: 1, max: 365, required: true },
    { name: "notes", label: "Примечание", type: "textarea", maxLength: 2000 },
  ],
  symptoms: [{ name: "description", label: "Что заметили у питомца", type: "textarea", required: true, maxLength: 2000 }, { name: "observed_at", label: "Когда заметили", type: "datetime-local", required: true }],
  allergies: [{ name: "allergen", label: "Аллерген", required: true, maxLength: 255 }, { name: "reactions", label: "Реакция", type: "textarea", maxLength: 2000 }, { name: "notes", label: "Примечание", type: "textarea", maxLength: 2000 }],
};
export function healthFormDefaults(data: HealthSectionData, resource: HealthResource, record?: HealthRecord, history = false): Record<string, string | number> {
  const values: Record<string, string | number> = { scheduled_on: data.today, visit_at: `${data.today}T09:00`, start_date: data.today, interval_days: 1, times: "09:00", status: history ? resource === "vaccinations" ? "done" : "completed" : "planned", reason: "examination", observed_at: datetimeInput(data.now) };
  if (record) for (const [key, value] of Object.entries(record.value)) {
    if (key === "visit_at" || key === "observed_at") values[key] = datetimeInput(String(value));
    else if (key === "times" && Array.isArray(value)) values[key] = value.map((time) => time.slice(0, 5)).join(", ");
    else if (typeof value === "string" || typeof value === "number") values[key] = value;
    else if (value === null) values[key] = "";
  }
  return values;
}
