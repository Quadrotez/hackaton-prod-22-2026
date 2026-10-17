"use client";

import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDownIcon, PlusIcon, XIcon, ListIcon } from "lucide-react";
import { toast } from "sonner";
import { useProtectedData } from "@/hooks/use-auth";
import { getPet, formatWeight, type Pet } from "@/lib/pets";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

const categories = {
  measurement: "Измерение", allergy: "Аллергия", medicine: "Лекарство",
  vaccine: "Прививка", visit: "Приём у врача",
};
type Category = keyof typeof categories;
type HealthRecord = { id: string; type: Category; name: string; detail: string; date: string; past: boolean };
type Symptom = { id: string; text: string; date: string };
const muted = "text-sm text-muted-foreground";

function dateLabel(value: string) {
  if (!value) return "Без даты";
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU");
}

function HealthSection({ title, subtitle, action, children, dark = false }: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode; dark?: boolean;
}) {
  return (
    <Card role="region" aria-label={title} className={`flex min-w-0 flex-col gap-3 p-4 ${dark ? "border-foreground bg-foreground text-background" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-[17px] font-semibold">{title}</h2>{subtitle && <p className={muted}>{subtitle}</p>}</div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function Expandable({ children, count }: { children: ReactNode[]; count: number }) {
  const [open, setOpen] = useState(false);
  return <>
    {count === 0 ? <p className={`${muted} py-2`}>Записей пока нет</p> : open ? children : children.slice(0, 1)}
    {count > 1 && <Button type="button" variant="secondary" aria-expanded={open} onClick={() => setOpen(!open)} className="w-full">
      {open ? "Свернуть" : `Показать все · ${count}`}<ChevronDownIcon aria-hidden="true" className={open ? "rotate-180" : ""} />
    </Button>}
  </>;
}

export function HealthPage({ petId }: { petId: number }) {
  const load = useCallback(() => getPet(petId), [petId]);
  const pet = useProtectedData(load, "Не удалось загрузить питомца");
  if (pet.status === "loading") return <PageLoading />;
  if (pet.status === "error") return <PageError message={pet.error} onRetry={pet.retry} backToList />;
  return <HealthContent key={petId} pet={pet.data} />;
}

function HealthContent({ pet }: { pet: Pet }) {
  // Временные локальные записи до подключения API здоровья. Данные профиля не изменяются.
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [symptomText, setSymptomText] = useState("");
  const [pregnant, setPregnant] = useState(false);
  const [pregnancyMonth, setPregnancyMonth] = useState("1");
  const [form, setForm] = useState<Category | null>(null);
  const [summary, setSummary] = useState(false);
  const [visitMap, setVisitMap] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = records.find((record) => record.id === editingId);

  function openForm(type: Category, id: string | null = null) {
    setEditingId(id);
    setForm(type);
  }
  function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name || !form) return;
    const record: HealthRecord = {
      id: editingId ?? crypto.randomUUID(), type: form, name,
      detail: String(data.get("detail") ?? "").trim(),
      date: String(data.get("date") ?? ""), past: data.get("past") === "on",
    };
    setRecords((previous) => editingId ? previous.map((item) => item.id === editingId ? record : item) : [...previous, record]);
    setForm(null);
    toast.success(editingId ? "Запись изменена" : "Запись добавлена");
  }
  function addSymptom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!symptomText.trim()) return;
    setSymptoms((previous) => [{ id: crypto.randomUUID(), text: symptomText.trim(), date: new Date().toLocaleDateString("ru-RU") }, ...previous]);
    setSymptomText("");
  }
  function removeAllergy(record: HealthRecord) {
    setRecords((previous) => previous.filter((item) => item.id !== record.id));
    toast("Аллергия удалена", { action: { label: "Восстановить", onClick: () => setRecords((previous) => previous.some((item) => item.id === record.id) ? previous : [...previous, record]) } });
  }
  function addButton(type: Category) {
    return <Button type="button" size="icon" className="size-9 rounded-full" aria-label={`Добавить: ${categories[type].toLowerCase()}`} onClick={() => openForm(type)}><PlusIcon aria-hidden="true" /></Button>;
  }
  function recordRows(list: HealthRecord[]) {
    return list.map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t py-3 text-sm">
      <div className="min-w-0 flex-1"><p className="break-words font-medium">{record.name}</p><p className={muted}>{dateLabel(record.date)}{record.detail && ` · ${record.detail}`}</p></div>
      <Button type="button" variant="ghost" size="sm" aria-label={`Изменить: ${record.name}`} onClick={() => openForm(record.type, record.id)}>Изменить</Button>
    </div>);
  }
  const ofType = (type: Category) => records.filter((record) => record.type === type);
  const measurements = ofType("measurement");
  const allergies = ofType("allergy");
  const visits = ofType("visit");
  const reasons = [...new Set(visits.map((record) => record.detail).filter(Boolean))];

  return (
    <section id="health-page" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title="Здоровье" description={pet.name} backHref={`/pet/${pet.id}`} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" aria-expanded={summary} onClick={() => setSummary(!summary)}><ListIcon aria-hidden="true" />Сводка</Button>
          <Button type="button" onClick={() => openForm("measurement")}><PlusIcon aria-hidden="true" />Добавить запись</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Новые записи сохраняются до перезагрузки страницы.</p>
      {summary && <HealthSection title="Сводка здоровья">
        <p className="text-sm">{pet.name} · Вес: {pet.weight_g != null ? formatWeight(pet.weight_g) : "не указан"}</p>
        <dl className="grid grid-cols-2 gap-3 text-sm">{Object.entries(categories).map(([key, label]) => <div key={key}><dt className={muted}>{label}</dt><dd className="font-semibold">{ofType(key as Category).length}</dd></div>)}</dl>
        <p className={muted}>Симптомов: {symptoms.length}</p>
      </HealthSection>}
      {form && <HealthSection title={editing ? "Изменить запись" : "Добавить запись"}>
        <form key={`${form}-${editingId}`} onSubmit={saveRecord} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">Тип записи<select className="h-9 rounded-lg border bg-background px-2" value={form} onChange={(event) => { setEditingId(null); setForm(event.target.value as Category); }} disabled={Boolean(editing)}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm">Название<Input autoFocus name="name" required maxLength={150} defaultValue={editing?.name} placeholder={form === "measurement" ? "Например, рост в холке" : "Название записи"} /></label>
          <label className="flex flex-col gap-1 text-sm">{form === "measurement" ? "Значение и единица измерения" : form === "allergy" ? "Реакция" : form === "medicine" ? "Дозировка" : form === "visit" ? "Причина визита" : "Клиника / примечание"}<Input name="detail" maxLength={300} defaultValue={editing?.detail} required={form === "measurement"} /></label>
          <label className="flex flex-col gap-1 text-sm">Дата<Input name="date" type="date" required defaultValue={editing?.date} /></label>
          {form === "visit" && <label className="flex items-center gap-2 text-sm"><input name="past" type="checkbox" defaultChecked={editing?.past} />Приём уже состоялся</label>}
          <div className="flex gap-2"><Button type="submit">Сохранить</Button><Button type="button" variant="outline" onClick={() => setForm(null)}>Отмена</Button></div>
        </form>
      </HealthSection>}
      <HealthSection title="Измерения" subtitle="Последние записи" action={addButton("measurement")}>
        {pet.weight_g != null && <div className="flex items-center justify-between border-t py-3"><span className={muted}>Вес из профиля</span><span className="text-lg font-semibold">{formatWeight(pet.weight_g)}</span></div>}
        <Expandable count={measurements.length}>{recordRows(measurements)}</Expandable>
      </HealthSection>
      <HealthSection title="Симптомы">
        <form onSubmit={addSymptom} className="flex gap-2"><Input aria-label="Описание симптома" placeholder="Что сейчас происходит?" value={symptomText} onChange={(event) => setSymptomText(event.target.value)} maxLength={300} required /><Button type="submit" disabled={!symptomText.trim()}>Добавить</Button></form>
        <div className="flex flex-wrap gap-1.5">{["Чихание", "Вялость", "Рвота", "Зуд"].map((text) => <Button key={text} type="button" variant="outline" size="sm" className="rounded-full text-xs" onClick={() => setSymptomText(text)}>{text}</Button>)}</div>
        <Expandable count={symptoms.length}>{symptoms.map((symptom) => <div key={symptom.id} className="border-t py-2"><p className="break-words text-sm font-medium">{symptom.text}</p><p className={muted}>{symptom.date}</p></div>)}</Expandable>
      </HealthSection>
      <HealthSection title="Беременность" subtitle={pregnant ? `Идёт · ${pregnancyMonth}-й месяц` : "Не отмечена"} action={
        <button type="button" role="switch" aria-label="Беременность" aria-checked={pregnant} onClick={() => setPregnant(!pregnant)} className={`relative h-[26px] w-[46px] rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${pregnant ? "bg-foreground" : "bg-border"}`}><span className={`absolute top-[3px] size-5 rounded-full bg-white transition-[left] ${pregnant ? "left-[23px]" : "left-[3px]"}`} /></button>
      }>
        {pregnant && <label className="flex items-center justify-between gap-2 border-t pt-3 text-sm">Месяц беременности<select aria-label="Месяц беременности" value={pregnancyMonth} onChange={(event) => setPregnancyMonth(event.target.value)} className="h-9 rounded-lg border bg-card px-2">{Array.from({ length: 9 }, (_, index) => <option key={index} value={index + 1}>{index + 1}-й месяц</option>)}</select></label>}
      </HealthSection>
      <HealthSection title="Причины визитов" dark>
        <p className="text-sm opacity-85">{reasons.length ? reasons.join(" · ") : "Причины визитов пока не указаны"}</p>
        <Button type="button" aria-expanded={visitMap} onClick={() => setVisitMap(!visitMap)}>Открыть карту визитов</Button>
        {visitMap && <ul className="flex flex-col gap-2 text-sm">{reasons.length ? reasons.map((reason) => <li key={reason}>{reason} · {visits.filter((record) => record.detail === reason).length} визитов</li>) : <li>Добавьте приём и укажите причину визита.</li>}</ul>}
      </HealthSection>
      <HealthSection title="Аллергии" subtitle={`Известные реакции · ${allergies.length}`} action={<Button type="button" variant="outline" onClick={() => openForm("allergy")}>Добавить аллергию</Button>}>
        <div className="flex flex-wrap gap-2">{allergies.length ? allergies.map((record) => <button key={record.id} type="button" aria-label={`Удалить аллергию: ${record.name}`} onClick={() => removeAllergy(record)} className="flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-destructive hover:bg-destructive hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"><span className="break-words">{record.name}{record.detail && ` · ${record.detail}`}</span><XIcon aria-hidden="true" className="size-3 shrink-0" /></button>) : <p className={muted}>Аллергии пока не добавлены</p>}</div>
      </HealthSection>
      {(["medicine", "vaccine"] as const).map((type) => <HealthSection key={type} title={type === "medicine" ? "Лекарства" : "Прививки"} subtitle={type === "medicine" ? "Ближайшие" : "Плановые"} action={addButton(type)}><Expandable count={ofType(type).length}>{recordRows(ofType(type))}</Expandable></HealthSection>)}
      <HealthSection title="Приёмы у врачей" action={addButton("visit")}>
        {[false, true].map((past) => {
          const list = visits.filter((record) => record.past === past);
          return <div key={String(past)} className="flex flex-col gap-2"><h3 className="text-sm">{past ? "Прошедшие" : "Записан"} · {list.length}</h3><Expandable count={list.length}>{recordRows(list)}</Expandable></div>;
        })}
      </HealthSection>
    </section>
  );
}
