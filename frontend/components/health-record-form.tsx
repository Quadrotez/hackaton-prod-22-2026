"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveHealth, type HealthData } from "@/lib/health";

export const recordKinds = { visit: "Приём у врача", vaccine: "Прививка", medicine: "Курс лекарства", measurement: "Измерение", allergy: "Аллергия" };
export type RecordKind = keyof typeof recordKinds;
export type FormTarget = { kind: RecordKind; id?: number; completed?: boolean };
type Props = { data: HealthData; target: FormTarget; busy: boolean; onCancel: () => void; onSave: (action: () => Promise<unknown>, message: string) => Promise<boolean> };
const selectClass = "h-9 w-full rounded-lg border bg-card px-2 text-sm";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-sm">{label}{children}</label>;
}
function datetimeInput(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function HealthRecordForm({ data, target, busy, onCancel, onSave }: Props) {
  const [kind, setKind] = useState(target.kind);
  const [error, setError] = useState("");
  const visit = kind === "visit" ? data.visits.find((item) => item.id === target.id) : undefined;
  const vaccine = kind === "vaccine" ? data.vaccinations.find((item) => item.id === target.id) : undefined;
  const medication = kind === "medicine" ? data.medications.find((item) => item.id === target.id) : undefined;
  const allergy = kind === "allergy" ? data.allergies.find((item) => item.id === target.id) : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const optional = (name: string) => text(name) || null;
    setError("");
    let path: string;
    let body: unknown;
    let method: "POST" | "PATCH" = target.id && kind !== "measurement" ? "PATCH" : "POST";
    if (kind !== "measurement" && !text("name")) { setError("Введите название."); return; }
    if (kind === "visit") {
      const date = new Date(text("date"));
      if (Number.isNaN(date.getTime())) { setError("Укажите дату и время приёма."); return; }
      path = "visits";
      body = { title: text("name"), visit_at: date.toISOString(), reason: text("reason"),
        status: text("status"), doctor_name: optional("doctor"), topic: optional("topic"), diagnosis: optional("diagnosis"), notes: optional("notes") };
    } else if (kind === "vaccine") {
      path = "vaccinations";
      body = { name: text("name"), scheduled_on: text("date"), status: text("status"), clinic: optional("clinic"), notes: optional("notes") };
    } else if (kind === "medicine") {
      const times = text("times").split(",").map((value) => value.trim());
      if (!times.length || times.length > 12 || times.some((value) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) {
        setError("Укажите время в формате 09:00, 18:00 (до 12 приёмов в день)."); return;
      }
      if (text("endDate") && text("endDate") < text("date")) { setError("Конец курса должен быть не раньше его начала."); return; }
      path = "medications";
      body = { name: text("name"), dose: text("dose"), start_date: text("date"), end_date: optional("endDate"),
        times, interval_days: Number(text("interval")), notes: optional("notes") };
    } else if (kind === "allergy") {
      path = "allergies";
      body = { allergen: text("name"), reactions: optional("reaction") };
    } else {
      const value = Number(text("value").replace(",", "."));
      if (!text("value") || !Number.isFinite(value)) { setError("Введите числовое значение измерения."); return; }
      path = `measurement-parameters/${text("parameter")}/measurements`;
      body = { value, measured_at: new Date(`${text("date")}T12:00:00`).toISOString() };
      method = "POST";
    }
    if (target.id && kind !== "measurement") path += `/${target.id}`;
    if (await onSave(() => saveHealth(data.pet.id, path, body, method), target.id && kind !== "measurement" ? "Запись изменена" : "Запись сохранена")) onCancel();
  }

  return <section aria-label="Форма записи здоровья" className="rounded-2xl border bg-card p-4 sm:p-5">
    <h2>{target.id && kind !== "measurement" ? "Изменить запись" : "Новая запись"}</h2>
    <form onSubmit={submit} className="mt-4">
      <fieldset disabled={busy} className="flex flex-col gap-4 disabled:opacity-70">
        <Field label="Тип записи"><select className={selectClass} value={kind} disabled={Boolean(target.id)} onChange={(event) => { setKind(event.target.value as RecordKind); setError(""); }}>{Object.entries(recordKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <div key={kind} className="flex flex-col gap-4">
          {kind === "measurement" ? <>
            <Field label="Параметр"><select name="parameter" required defaultValue={target.id} className={selectClass}>{data.measurements.map((item) => <option key={item.id} value={item.id}>{item.name}{item.unit && `, ${item.unit}`}</option>)}</select></Field>
            <Field label="Значение"><Input name="value" inputMode="decimal" required maxLength={20} placeholder="Например, 4,6" /></Field>
          </> : <Field label={kind === "allergy" ? "Аллерген" : "Название"}><Input name="name" autoFocus required maxLength={255} defaultValue={visit?.title ?? vaccine?.name ?? medication?.name ?? allergy?.allergen} placeholder={kind === "visit" ? "Например, осмотр у ветеринара" : undefined} /></Field>}
          {kind !== "allergy" && <Field label={kind === "visit" ? "Дата и время приёма" : kind === "medicine" ? "Начало курса" : "Дата"}><Input name="date" type={kind === "visit" ? "datetime-local" : "date"} required defaultValue={visit ? datetimeInput(visit.visit_at) : vaccine?.scheduled_on ?? medication?.start_date ?? (kind === "visit" ? `${data.today}T09:00` : data.today)} /></Field>}
          {kind === "visit" && <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Статус"><select name="status" className={selectClass} defaultValue={visit?.status ?? (target.completed ? "completed" : "planned")}><option value="planned">Запланирован</option><option value="completed">Состоялся</option><option value="cancelled">Отменён</option></select></Field>
              <Field label="Причина"><select name="reason" className={selectClass} defaultValue={visit?.reason ?? "examination"}><option value="examination">Осмотр</option><option value="illness">Болезнь / жалоба</option><option value="vaccination">Вакцинация</option><option value="checkup">Контрольный приём</option></select></Field>
            </div>
            <Field label="Врач (необязательно)"><Input name="doctor" maxLength={255} defaultValue={visit?.doctor_name ?? ""} /></Field>
            <Field label="Жалоба или тема визита"><Input name="topic" maxLength={255} defaultValue={visit?.topic ?? ""} placeholder="Например, расстройство пищеварения" /></Field>
            <Field label="Диагноз / заключение после приёма"><textarea name="diagnosis" rows={3} maxLength={5000} defaultValue={visit?.diagnosis ?? ""} className="rounded-lg border bg-background p-2 text-sm" /></Field>
          </>}
          {kind === "vaccine" && <>
            <Field label="Статус"><select name="status" className={selectClass} defaultValue={vaccine?.status ?? (target.completed ? "done" : "planned")}><option value="planned">Запланирована</option><option value="done">Сделана</option></select></Field>
            <Field label="Клиника"><Input name="clinic" maxLength={255} defaultValue={vaccine?.clinic ?? ""} /></Field>
          </>}
          {kind === "medicine" && <>
            <Field label="Дозировка"><Input name="dose" required maxLength={100} defaultValue={medication?.dose} placeholder="Например, 1 таблетка" /></Field>
            <Field label="Время приёма через запятую"><Input name="times" required defaultValue={medication?.times.map((time) => time.slice(0, 5)).join(", ") ?? "09:00"} /></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Конец курса (необязательно)"><Input name="endDate" type="date" defaultValue={medication?.end_date ?? ""} /></Field><Field label="Интервал, дней"><Input name="interval" type="number" min={1} max={365} required defaultValue={medication?.interval_days ?? 1} /></Field></div>
          </>}
          {kind === "allergy" && <Field label="Реакция"><Input name="reaction" maxLength={2000} defaultValue={allergy?.reactions ?? ""} /></Field>}
          {["visit", "vaccine", "medicine"].includes(kind) && <Field label="Примечание"><Input name="notes" maxLength={2000} defaultValue={visit?.notes ?? vaccine?.notes ?? medication?.notes ?? ""} /></Field>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2"><Button type="submit">{busy ? "Сохраняем…" : "Сохранить"}</Button><Button type="button" variant="outline" onClick={onCancel}>Отмена</Button></div>
      </fieldset>
    </form>
  </section>;
}
