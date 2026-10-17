"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { PlusIcon, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { useProtectedData, useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { healthSections, loadHealthSection, saveHealthRecord, deleteHealthRecord, markHealthDose, clearHealthDose, recordIsHistory, recordTitle, recordDate, type HealthSection, type HealthSectionData, type HealthRecord, type HealthResource } from "@/lib/health";
import { HealthSectionForm } from "@/components/health-section-form";
import { HealthRecordCard } from "@/components/health-record-card";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";

export function HealthSectionPage({ petId, section }: { petId: number; section: HealthSection }) {
  const load = useCallback(() => loadHealthSection(petId, section), [petId, section]);
  const state = useProtectedData(load, "Не удалось загрузить записи здоровья");
  if (state.status === "loading" || (state.status === "ready" && (state.data.pet.id !== petId || state.data.section !== section))) return <PageLoading />;
  if (state.status === "error") return <PageError message={state.error} onRetry={state.retry} backToList />;
  return <HealthSectionContent key={`${petId}-${section}`} data={state.data} onUpdate={state.update} />;
}
function HealthSectionContent({ data, onUpdate }: { data: HealthSectionData; onUpdate: (data: HealthSectionData) => void }) {
  const { pet, section } = data;
  const config = healthSections[section];
  const { handleAuthError } = useRequireAuth();
  const [filter, setFilter] = useState("all");
  const [pending, setPending] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [form, setForm] = useState<{ resource: HealthResource; record?: HealthRecord } | null>(null);
  const [deleting, setDeleting] = useState<HealthRecord | null>(null);
  const resource = section === "symptoms" && filter === "allergies" ? "allergies" : config.resource;
  const ownRecords = data.records.filter((record) => record.resource === resource);
  const past = ownRecords.filter((record) => recordIsHistory(record, data.today));
  const visible = ownRecords.filter((record) => filter === "history" ? recordIsHistory(record, data.today) : filter === "plan" ? !recordIsHistory(record, data.today) : true)
    .sort((first, second) => {
      const order = section === "symptoms" || filter === "history" ? -1 : 1;
      return order * (new Date(recordDate(first)).getTime() - new Date(recordDate(second)).getTime()) || second.value.id - first.value.id;
    });
  const filters = section === "symptoms" ? [{ value: "all", label: "Наблюдения" }, { value: "allergies", label: "Аллергии" }] : [{ value: "all", label: "Все" }, { value: "plan", label: section === "medicines" ? "Текущие и будущие" : "План" }, { value: "history", label: "История" }];

  async function refresh() {
    onUpdate(await loadHealthSection(pet.id, section));
    setRefreshError(false);
  }
  async function retryRefresh() {
    setPending(true);
    try { await refresh(); }
    catch (error) { if (!handleAuthError(error)) toast.error(getErrorMessage(error, "Не удалось обновить список")); }
    finally { setPending(false); }
  }
  async function run(action: () => Promise<unknown>, message: string) {
    if (pending) return false;
    setPending(true);
    try {
      await action();
      toast.success(message);
      try { await refresh(); } catch (error) { if (!handleAuthError(error)) setRefreshError(true); }
      return true;
    } catch (error) {
      if (!handleAuthError(error)) toast.error(getErrorMessage(error, "Не удалось сохранить изменения. Попробуйте ещё раз"));
      return false;
    } finally { setPending(false); }
  }
  async function save(body: unknown) {
    if (!form) return false;
    const saved = await run(() => saveHealthRecord(pet.id, form.resource, body, form.record?.value.id), form.record ? "Запись обновлена" : "Запись сохранена");
    if (saved) { setForm(null); setFilter(form.resource === "allergies" ? "allergies" : "all"); }
    return saved;
  }
  return <>
    <PageHeader title={config.title} description={pet.name} backHref={`/pet/${pet.id}/health`} />
    <p className="-mt-3 text-sm text-muted-foreground">{config.description}</p>
    <div className="grid grid-cols-2 gap-3"><Card variant="accent" className="space-y-1"><p className="text-sm">{section === "symptoms" ? "Наблюдений" : "Всего записей"}</p><p className="text-2xl font-semibold tabular-nums">{data.records.filter((record) => record.resource === config.resource).length}</p></Card><Card className="space-y-1"><p className="text-sm text-muted-foreground">{section === "symptoms" ? "Аллергий" : "В истории"}</p><p className="text-2xl font-semibold tabular-nums">{section === "symptoms" ? data.records.filter((record) => record.resource === "allergies").length : past.length}</p></Card></div>
    {refreshError && <div role="alert" className="rounded-xl border bg-card p-4 text-sm">Изменения сохранены, но список не удалось обновить. <Button type="button" variant="outline" size="sm" disabled={pending} onClick={retryRefresh}>Обновить</Button></div>}
    {section === "medicines" && <Card role="region" aria-label="Приём лекарств сегодня" className="flex flex-col gap-3"><h2>Сегодня</h2>{data.doses.length ? data.doses.map((dose) => <div key={`${dose.medication_id}-${dose.scheduled_for}`} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><div><p className="text-sm font-medium">{dose.scheduled_for.slice(11, 16)} · {dose.name}</p><p className="text-xs text-muted-foreground">{dose.dose} · {dose.status === "pending" ? "Не отмечено" : dose.status === "taken" ? "Принято" : "Пропущено"}</p></div><div className="flex gap-1">{dose.status === "pending" ? <><Button type="button" size="sm" disabled={pending} onClick={() => run(() => markHealthDose(pet.id, dose, "taken"), "Приём отмечен")}>Принято</Button><Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => markHealthDose(pet.id, dose, "skipped"), "Приём пропущен")}>Пропустить</Button></> : <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => clearHealthDose(pet.id, dose), "Отметка снята")}>Снять отметку</Button>}</div></div>) : <p className="text-sm text-muted-foreground">На сегодня приёмов лекарств нет.</p>}</Card>}
    <div className="flex flex-wrap items-center justify-between gap-3"><div role="group" aria-label="Фильтр записей" className="flex flex-wrap gap-1.5">{filters.map((item) => <Button key={item.value} type="button" variant={filter === item.value ? "default" : "outline"} size="sm" className="rounded-full" aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); setForm(null); }} disabled={pending}>{item.label}</Button>)}</div>{!form && <Button type="button" disabled={pending} onClick={() => setForm({ resource })}><PlusIcon aria-hidden="true" />{resource === "allergies" ? "Аллергия" : "Добавить"}</Button>}</div>
    {form && <HealthSectionForm key={`${form.resource}-${form.record?.value.id ?? "new"}`} data={data} resource={form.resource} record={form.record} history={filter === "history"} pending={pending} onSave={save} onCancel={() => setForm(null)} />}
    <p role="status" className="sr-only">Записей в списке: {visible.length}</p>
    <section aria-label="Записи здоровья" className="flex flex-col gap-3">
      {visible.map((record) => <HealthRecordCard key={`${record.resource}-${record.value.id}`} record={record} today={data.today} pending={pending} onEdit={() => setForm({ resource: record.resource, record })} onDelete={() => setDeleting(record)} onComplete={() => run(() => saveHealthRecord(pet.id, record.resource, { status: record.resource === "visits" ? "completed" : "done" }, record.value.id), record.resource === "visits" ? "Приём перенесён в историю" : "Прививка перенесена в историю")} />)}
      {!visible.length && <Card className="flex flex-col items-start gap-3"><h2>{filter === "history" ? "История пока пуста" : "Записей пока нет"}</h2><p className="text-sm text-muted-foreground">{filter === "history" ? "Здесь появятся состоявшиеся приёмы, сделанные прививки или завершённые курсы." : resource === "allergies" ? "Запишите аллерген и реакцию питомца." : section === "symptoms" ? "Добавьте наблюдение — например, изменение аппетита или необычное поведение." : "Добавьте первую запись. Она сохранится в профиле питомца."}</p></Card>}
    </section>
    {section !== "symptoms" && <Link href="/calendar" className="flex items-center gap-2 self-start text-sm text-muted-foreground underline underline-offset-4"><CalendarIcon aria-hidden="true" className="size-4" />К календарю</Link>}
    <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open && !pending) setDeleting(null); }}>
      <AlertDialogContent className="theme-shadcn"><AlertDialogHeader><AlertDialogTitle>Удалить запись?</AlertDialogTitle><AlertDialogDescription>«{deleting && recordTitle(deleting)}» будет удалена из истории питомца. Восстановить запись не получится.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={async () => { if (deleting && await run(() => deleteHealthRecord(pet.id, deleting), "Запись удалена")) { setDeleting(null); setForm(null); } }}>{pending && <Spinner />}Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </>;
}
