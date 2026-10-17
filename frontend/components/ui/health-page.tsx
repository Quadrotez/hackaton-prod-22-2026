"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import Link from "next/link";
import { CalendarDaysIcon, CheckIcon, ClipboardListIcon, HistoryIcon, PlusIcon, XIcon, ArrowUpRightIcon } from "lucide-react";
import { toast } from "sonner";
import { useProtectedData, useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { loadHealth, saveHealth, deleteHealth, type HealthData, type HealthView } from "@/lib/health";
import { toDateKey } from "@/lib/health-events";
import { formatWeight } from "@/lib/pets";
import { HealthRecordForm, type FormTarget, type RecordKind } from "@/components/health-record-form";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const muted = "text-sm text-muted-foreground";
const views = [
  { value: "observations", label: "Наблюдения", icon: ClipboardListIcon },
  { value: "plan", label: "План", icon: CalendarDaysIcon },
  { value: "history", label: "История", icon: HistoryIcon },
] as const;
function formatDate(value: string, time = false) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return date.toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) });
}
function HealthSection({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return <Card role="region" aria-label={title} className="flex min-w-0 flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2>{title}</h2>{description && <p className={muted}>{description}</p>}</div>{action}</div>{children}
  </Card>;
}
function Empty({ children }: { children: ReactNode }) { return <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{children}</p>; }
function EventCard({ recordKey, title, subtitle, status, highlighted, children, actions }: {
  recordKey: string; title: string; subtitle: string; status: string; highlighted: boolean; children?: ReactNode; actions: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (highlighted) ref.current?.focus(); }, [highlighted]);
  return <div ref={ref} tabIndex={-1} id={`health-${recordKey}`} className={`scroll-mt-6 rounded-xl border p-4 outline-none focus-visible:ring-2 focus-visible:ring-foreground ${highlighted ? "border-foreground bg-primary/20 ring-2 ring-primary" : "bg-background/50"}`}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><h3 className="break-words">{title}</h3><p className={muted}>{subtitle}</p></div><span className="rounded-full bg-secondary px-2 py-1 text-xs">{status}</span></div>
    {children && <div className="mt-3 space-y-1 break-words text-sm">{children}</div>}
    <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
  </div>;
}

export function HealthPage({ petId, initialView = "observations", highlightedEvent = "" }: { petId: number; initialView?: HealthView; highlightedEvent?: string }) {
  const load = useCallback(() => loadHealth(petId), [petId]);
  const state = useProtectedData(load, "Не удалось загрузить здоровье питомца");
  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") return <PageError message={state.error} onRetry={state.retry} backToList />;
  return <HealthContent key={`${petId}-${initialView}-${highlightedEvent}`} data={state.data} onUpdate={state.update} initialView={initialView} highlightedEvent={highlightedEvent} />;
}

function HealthContent({ data, onUpdate, initialView, highlightedEvent }: { data: HealthData; onUpdate: (data: HealthData) => void; initialView: HealthView; highlightedEvent: string }) {
  const { handleAuthError } = useRequireAuth();
  const linkedMedicine = data.medications.find((item) => `medicine-${item.id}` === highlightedEvent);
  const [view, setView] = useState<HealthView>(() => linkedMedicine ? (linkedMedicine.end_date && linkedMedicine.end_date < data.today ? "history" : "plan") : initialView);
  const [form, setForm] = useState<FormTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [symptomText, setSymptomText] = useState("");
  const [showAllSymptoms, setShowAllSymptoms] = useState(false);
  const [summary, setSummary] = useState(false);
  const { pet } = data;

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      try { onUpdate(await loadHealth(pet.id)); setRefreshError(false); }
      catch { setRefreshError(true); }
      return true;
    } catch (error) {
      if (!handleAuthError(error)) toast.error(getErrorMessage(error, "Не удалось сохранить запись. Попробуйте ещё раз"));
      return false;
    } finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true);
    try { onUpdate(await loadHealth(pet.id)); setRefreshError(false); }
    catch (error) { if (!handleAuthError(error)) toast.error(getErrorMessage(error, "Не удалось обновить записи")); }
    finally { setBusy(false); }
  }
  function open(kind: RecordKind, id?: number) { setForm({ kind, id, completed: view === "history" }); }
  function addButton(kind: RecordKind) { return <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => open(kind)}><PlusIcon aria-hidden="true" />Добавить</Button>; }
  async function addSymptom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!symptomText.trim()) return;
    if (await run(() => saveHealth(pet.id, "symptoms", { description: symptomText.trim(), observed_at: new Date().toISOString() }), "Наблюдение сохранено")) setSymptomText("");
  }
  const plannedVisits = data.visits.filter((visit) => visit.status === "planned").sort((a, b) => a.visit_at.localeCompare(b.visit_at));
  const pastVisits = data.visits.filter((visit) => visit.status !== "planned").sort((a, b) => b.visit_at.localeCompare(a.visit_at));
  const plannedVaccines = data.vaccinations.filter((vaccine) => vaccine.status === "planned").sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on));
  const doneVaccines = data.vaccinations.filter((vaccine) => vaccine.status === "done").sort((a, b) => b.scheduled_on.localeCompare(a.scheduled_on));
  const activeMedicines = data.medications.filter((item) => !item.end_date || item.end_date >= data.today);
  const pastMedicines = data.medications.filter((item) => item.end_date && item.end_date < data.today);
  const counts = { observations: data.symptoms.length, plan: plannedVisits.length + plannedVaccines.length + activeMedicines.length, history: pastVisits.length + doneVaccines.length + pastMedicines.length };

  function visitCards(planned: boolean) {
    return (planned ? plannedVisits : pastVisits).map((visit) => <EventCard key={visit.id} recordKey={`visit-${visit.id}`} highlighted={highlightedEvent === `visit-${visit.id}`} title={visit.title} subtitle={`${formatDate(visit.visit_at, true)}${visit.doctor_name ? ` · ${visit.doctor_name}` : ""}`}
      status={visit.status === "completed" ? "Состоялся" : visit.status === "cancelled" ? "Отменён" : toDateKey(new Date(visit.visit_at)) < data.today ? "Уточните результат" : "Запланирован"}
      actions={<><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => open("visit", visit.id)}>Изменить</Button>{planned && <><Button type="button" size="sm" disabled={busy} onClick={async () => { if (await run(() => saveHealth(pet.id, `visits/${visit.id}`, { status: "completed" }, "PATCH"), "Приём перенесён в историю")) setView("history"); }}><CheckIcon aria-hidden="true" />Приём состоялся</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => run(() => saveHealth(pet.id, `visits/${visit.id}`, { status: "cancelled" }, "PATCH"), "Приём отменён")}>Отменить приём</Button></>}</>}>
      {visit.topic && <p><span className="text-muted-foreground">Жалоба: </span>{visit.topic}</p>}
      {visit.diagnosis && <p><span className="text-muted-foreground">Заключение: </span>{visit.diagnosis}</p>}
      {visit.notes && <p>{visit.notes}</p>}
    </EventCard>);
  }
  function vaccineCards(planned: boolean) {
    return (planned ? plannedVaccines : doneVaccines).map((item) => <EventCard key={item.id} recordKey={`vaccine-${item.id}`} highlighted={highlightedEvent === `vaccine-${item.id}`} title={item.name} subtitle={`${formatDate(item.scheduled_on)}${item.clinic ? ` · ${item.clinic}` : ""}`} status={planned ? "Запланирована" : "Сделана"}
      actions={<><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => open("vaccine", item.id)}>Изменить</Button>{planned && <Button type="button" size="sm" disabled={busy} onClick={async () => { if (await run(() => saveHealth(pet.id, `vaccinations/${item.id}`, { status: "done" }, "PATCH"), "Прививка перенесена в историю")) setView("history"); }}>Отметить сделанной</Button>}</>}>{item.notes}</EventCard>);
  }
  function medicineCards(active: boolean) {
    return (active ? activeMedicines : pastMedicines).map((item) => <EventCard key={item.id} recordKey={`medicine-${item.id}`} highlighted={highlightedEvent === `medicine-${item.id}`} title={item.name} subtitle={`${formatDate(item.start_date)}${item.end_date ? ` — ${formatDate(item.end_date)}` : " · без даты окончания"}`} status={active ? item.start_date > data.today ? "Начнётся позже" : "Текущий курс" : "Курс завершён"}
      actions={<Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => open("medicine", item.id)}>Изменить</Button>}><p>{item.dose} · {item.times.map((time) => time.slice(0, 5)).join(", ")} · {item.interval_days === 1 ? "ежедневно" : `каждые ${item.interval_days} дн.`}</p>{item.notes && <p>{item.notes}</p>}</EventCard>);
  }

  return <section id="health-page" className="flex min-w-0 flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-4"><PageHeader title="Здоровье" description={pet.name} backHref={`/pet/${pet.id}`} /><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" aria-expanded={summary} onClick={() => setSummary(!summary)}>Сводка</Button><Button type="button" disabled={busy} onClick={() => open(view === "observations" ? "measurement" : "visit")}><PlusIcon aria-hidden="true" />Добавить запись</Button></div></div>
    {summary && <HealthSection title="Сводка здоровья"><p className="text-sm">{pet.name} · Вес: {pet.weight_g != null ? formatWeight(pet.weight_g) : "не указан"}</p><p className={muted}>Наблюдений: {data.symptoms.length} · В плане: {counts.plan} · В истории: {counts.history}</p><p className={muted}>Аллергий: {data.allergies.length}</p></HealthSection>}
    {refreshError && <div role="alert" className="rounded-xl border p-3 text-sm">Запись сохранена, но список не удалось обновить. <Button type="button" variant="outline" size="sm" disabled={busy} onClick={refresh}>Обновить</Button></div>}
    {form && <HealthRecordForm key={`${form.kind}-${form.id ?? "new"}`} data={data} target={form} busy={busy} onCancel={() => setForm(null)} onSave={run} />}
    <Tabs value={view} onValueChange={(value) => setView(value as HealthView)}>
      <TabsList className="grid h-auto! w-full! grid-cols-3 gap-1 rounded-xl p-1">
        {views.map(({ value, label, icon: Icon }) => <TabsTrigger key={value} value={value} className="flex min-w-0 flex-col gap-1 rounded-lg px-1 py-3 sm:flex-row sm:gap-2"><Icon aria-hidden="true" /><span>{label}</span><span className="hidden text-xs opacity-60 sm:inline">{counts[value]}</span></TabsTrigger>)}
      </TabsList>
      <TabsContent value="observations" className="mt-4 flex flex-col gap-4">
        <p className={muted}>Что замечаете у питомца сейчас. Эти записи помогут описать жалобы врачу.</p>
        <HealthSection title="Наблюдения и симптомы" description="Например: необычный стул, вялость или зуд">
          <form onSubmit={addSymptom} className="flex gap-2"><Input aria-label="Описание наблюдения" placeholder="Что изменилось у питомца?" value={symptomText} onChange={(event) => setSymptomText(event.target.value)} maxLength={2000} required disabled={busy} /><Button type="submit" disabled={busy || !symptomText.trim()}>Добавить</Button></form>
          <div className="flex flex-wrap gap-1.5">{["Необычный стул", "Вялость", "Рвота", "Зуд"].map((text) => <Button key={text} type="button" variant="outline" size="sm" className="rounded-full text-xs" disabled={busy} onClick={() => setSymptomText(text)}>{text}</Button>)}</div>
          {!data.symptoms.length && <Empty>Пока нет наблюдений. Запишите, что вас беспокоит, чтобы не забыть к приёму.</Empty>}
          {(showAllSymptoms ? data.symptoms : data.symptoms.slice(0, 3)).map((item) => <div key={item.id} className="border-t py-3"><p className="break-words text-sm font-medium">{item.description}</p><p className={muted}>{formatDate(item.observed_at, true)}</p><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setView("plan"); open("visit"); }}>Запланировать приём</Button></div>)}
          {data.symptoms.length > 3 && <Button type="button" variant="outline" aria-expanded={showAllSymptoms} onClick={() => setShowAllSymptoms(!showAllSymptoms)}>{showAllSymptoms ? "Свернуть" : `Все наблюдения · ${data.symptoms.length}`}</Button>}
        </HealthSection>
        <HealthSection title="Измерения" description="Последние замеры и изменения" action={addButton("measurement")}>
          {data.measurements.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t py-3"><div><p className={muted}>{item.name}</p><p className="font-semibold">{item.latest ? `${item.latest.value} ${item.unit ?? ""}` : "Нет замеров"}</p>{item.latest && <p className="text-xs text-muted-foreground">{formatDate(item.latest.measured_at)}{item.change !== null && ` · изменение ${item.change > 0 ? "+" : ""}${item.change} ${item.unit ?? ""}`}</p>}</div><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => open("measurement", item.id)}>Новый замер</Button></div>)}
          {!data.measurements.length && <Empty>Параметры измерений пока не добавлены.</Empty>}
        </HealthSection>
        <HealthSection title="Аллергии" description="Известные реакции питомца" action={addButton("allergy")}>
          <div className="flex flex-wrap gap-2">{data.allergies.map((item) => <div key={item.id} className="flex max-w-full items-center gap-1 rounded-full border px-3 py-1 text-sm"><button type="button" className="break-words text-left" disabled={busy} onClick={() => open("allergy", item.id)}>{item.allergen}{item.reactions && ` · ${item.reactions}`}</button><Button type="button" variant="ghost" size="icon-xs" aria-label={`Удалить аллергию: ${item.allergen}`} disabled={busy} onClick={async () => { if (await run(() => deleteHealth(pet.id, `allergies/${item.id}`), "Аллергия удалена")) toast("Можно восстановить запись", { action: { label: "Восстановить", onClick: () => { void run(() => saveHealth(pet.id, "allergies", { allergen: item.allergen, reactions: item.reactions, notes: item.notes }), "Аллергия восстановлена"); } } }); }}><XIcon aria-hidden="true" /></Button></div>)}</div>
          {!data.allergies.length && <Empty>Известные аллергии пока не записаны.</Empty>}
        </HealthSection>
        {pet.sex === "girl" && <HealthSection title="Беременность" description={data.pregnancy ? `Идёт · ${data.pregnancy.month}-й месяц` : "Не отмечена"} action={<Button type="button" variant="outline" disabled={busy} onClick={() => run(() => data.pregnancy ? deleteHealth(pet.id, "pregnancy") : saveHealth(pet.id, "pregnancy", { month: 1 }, "PUT"), data.pregnancy ? "Беременность завершена" : "Беременность отмечена")}>{data.pregnancy ? "Завершить" : "Отметить"}</Button>}>
          {data.pregnancy && <label className="flex items-center justify-between gap-2 text-sm">Месяц беременности<select aria-label="Месяц беременности" disabled={busy} value={data.pregnancy.month} onChange={(event) => run(() => saveHealth(pet.id, "pregnancy", { month: Number(event.target.value) }, "PUT"), "Срок обновлён")} className="h-9 rounded-lg border bg-card px-2">{Array.from({ length: 9 }, (_, index) => <option key={index} value={index + 1}>{index + 1}-й месяц</option>)}</select></label>}
        </HealthSection>}
      </TabsContent>
      <TabsContent value="plan" className="mt-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className={muted}>Что предстоит сделать. Приёмы, прививки и лекарства видны в календаре.</p><Link href="/calendar" className="flex items-center gap-1 text-sm underline underline-offset-4">Календарь<ArrowUpRightIcon aria-hidden="true" className="size-3.5" /></Link></div>
        <HealthSection title="Приёмы у врача" description="После приёма отметьте результат — запись перейдёт в историю" action={addButton("visit")}>{visitCards(true)}{!plannedVisits.length && <Empty>Приёмов пока нет. Добавьте дату, время и причину визита.</Empty>}</HealthSection>
        <HealthSection title="Плановые прививки" action={addButton("vaccine")}>{vaccineCards(true)}{!plannedVaccines.length && <Empty>Прививки пока не запланированы.</Empty>}</HealthSection>
        <HealthSection title="Курсы лекарств" action={addButton("medicine")}>{medicineCards(true)}{!activeMedicines.length && <Empty>Текущих и будущих курсов нет.</Empty>}</HealthSection>
      </TabsContent>
      <TabsContent value="history" className="mt-4 flex flex-col gap-4">
        <p className={muted}>Что уже произошло: приёмы, жалобы, заключения врача и завершённые курсы.</p>
        <HealthSection title="Приёмы и заключения" action={addButton("visit")}>{visitCards(false)}{!pastVisits.length && <Empty>Здесь появятся состоявшиеся и отменённые приёмы. Диагноз и заключение можно добавить через «Изменить».</Empty>}</HealthSection>
        <HealthSection title="Сделанные прививки">{vaccineCards(false)}{!doneVaccines.length && <Empty>Сделанные прививки пока не записаны.</Empty>}</HealthSection>
        <HealthSection title="Завершённые курсы">{medicineCards(false)}{!pastMedicines.length && <Empty>Завершённых курсов пока нет.</Empty>}</HealthSection>
      </TabsContent>
    </Tabs>
  </section>;
}
