"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDownIcon, PencilIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { useProtectedData, useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { datetimeInput } from "@/lib/health-sections";
import { loadMeasurements, measurementNumber, measurementValue, renameMeasurementParameter, saveMeasurement, type MeasurementPoint, type MeasurementsData } from "@/lib/measurements";
import { updatePet, type Pet } from "@/lib/pets";
import { cn } from "@/lib/utils";
import { MeasurementHistory } from "@/components/measurement-history";
import { MeasurementEditor, type MeasurementDraft } from "@/components/measurement-editor";
import { PetWeightChart } from "@/components/pet-weight-chart";
import { PetInfoCard } from "@/components/pet-info-card";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

type Editor = { kind: "weight" } | { kind: "parameter"; id: number; mode: "add" | "edit"; date: string };

export function MeasurementsPage({ petId, embedded = false, onPetChange }: { petId: number; embedded?: boolean; onPetChange?: (pet: Pet) => void }) {
  const load = useCallback(() => loadMeasurements(petId), [petId]);
  const state = useProtectedData(load, "Не удалось загрузить измерения");
  if (state.status === "loading" || (state.status === "ready" && state.data.pet.id !== petId)) return embedded
    ? <Card><h2>Измерения</h2><p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Загружаем измерения…</p></Card>
    : <PageLoading />;
  if (state.status === "error") return embedded
    ? <Card role="alert" className="space-y-3"><h2>Измерения</h2><p className="text-sm text-muted-foreground">{state.error}</p><Button type="button" variant="outline" size="sm" onClick={state.retry}>Попробовать ещё раз</Button></Card>
    : <PageError message={state.error} onRetry={state.retry} backToList />;
  return <MeasurementsContent key={petId} data={state.data} onUpdate={state.update} embedded={embedded} onPetChange={onPetChange} />;
}

function MeasurementRow({ name, unit, history, currentValue, pending, onAdd, onEdit, children }: {
  name: string; unit: string | null; history: MeasurementPoint[]; currentValue?: number | null;
  pending: boolean; onAdd: () => void; onEdit?: () => void; children?: ReactNode;
}) {
  const latest = history[history.length - 1];
  const value = latest?.value ?? currentValue;
  const change = history.length > 1 ? latest.value - history[history.length - 2].value : null;
  return (
    <div className="flex flex-col gap-2 border-t py-3">
      {children || <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 sm:w-[220px] sm:shrink-0">
          <p className="break-words text-[13px] text-muted-foreground">{name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-baseline gap-2 whitespace-nowrap text-lg font-semibold tabular-nums sm:w-[130px]">{value == null ? "—" : measurementValue(value, unit)}
              {change !== null && <span className="text-xs font-medium text-muted-foreground" title="Изменение относительно предыдущего измерения">{change > 0 ? "+" : ""}{measurementNumber(change)}</span>}
            </span>
            <Button type="button" variant="outline" size="icon" disabled={pending} onClick={onAdd} aria-label={`Новое измерение: ${name}`} title="Обновить значение"><RefreshCwIcon aria-hidden="true" /></Button>
            {onEdit && <Button type="button" variant="outline" size="icon" disabled={pending} onClick={onEdit} aria-label={`Изменить последнее измерение: ${name}`} title="Изменить последнее значение"><PencilIcon aria-hidden="true" /></Button>}
          </div>
          {latest && <span className="sr-only">Измерено {new Date(latest.measured_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</span>}
        </div>
        <MeasurementHistory name={name} unit={unit} history={history} />
      </div>}
    </div>
  );
}

function MeasurementsContent({ data, onUpdate, embedded, onPetChange }: { data: MeasurementsData; onUpdate: (data: MeasurementsData) => void; embedded: boolean; onPetChange?: (pet: Pet) => void }) {
  const { pet, parameters } = data;
  const { handleAuthError } = useRequireAuth();
  const [showAll, setShowAll] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pending, setPending] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const weightHistory = data.weights.map((entry) => ({ value: entry.weight_g / 1000, measured_at: entry.measured_at }));

  async function refresh() {
    const next = await loadMeasurements(pet.id);
    onUpdate(next);
    onPetChange?.(next.pet);
    setRefreshError(false);
  }
  async function retryRefresh() {
    setPending(true);
    try { await refresh(); }
    catch (error) { if (!handleAuthError(error)) toast.error(getErrorMessage(error, "Не удалось обновить измерения")); }
    finally { setPending(false); }
  }
  function openParameter(id: number, mode: "add" | "edit") {
    const parameter = parameters.find((item) => item.id === id)!;
    const latest = parameter.history[parameter.history.length - 1];
    setEditor({ kind: "parameter", id, mode, date: datetimeInput(mode === "edit" && latest ? latest.measured_at : new Date().toISOString()) });
  }
  async function save(draft: MeasurementDraft) {
    if (pending || !editor) return;
    setPending(true);
    try {
      if (editor.kind === "weight") {
        await updatePet(pet.id, { weight_g: Math.round(draft.value * 1000) });
      } else {
        const parameter = parameters.find((item) => item.id === editor.id)!;
        const latest = parameter.history[parameter.history.length - 1];
        const measuredAt = editor.mode === "edit" && latest && draft.measured_at === new Date(editor.date).toISOString()
          ? latest.measured_at : draft.measured_at!;
        if (draft.name !== parameter.name) await renameMeasurementParameter(pet.id, parameter.id, draft.name);
        await saveMeasurement(pet.id, parameter.id, { value: draft.value, measured_at: measuredAt }, editor.mode === "edit" ? latest?.id : undefined);
      }
      setEditor(null);
      toast.success("Измерение сохранено");
      try { await refresh(); }
      catch (error) { if (!handleAuthError(error)) setRefreshError(true); }
    } catch (error) {
      if (!handleAuthError(error)) {
        toast.error(getErrorMessage(error, "Не удалось сохранить измерение"));
        // A rename may have succeeded before saving the value failed.
        try { await refresh(); } catch { setRefreshError(true); }
      }
    } finally { setPending(false); }
  }

  return (
    <>
      {!embedded && <>
        <PageHeader title="Измерения" description={pet.name} backHref={`/pet/${pet.id}`} />
        <PetInfoCard pet={pet} onPetChange={(updated) => {
          onUpdate({ ...data, pet: updated });
          onPetChange?.(updated);
        }} />
      </>}
      {refreshError && <div role="alert" className="rounded-xl border bg-card p-4 text-sm">Не удалось обновить список измерений. <Button type="button" variant="outline" size="sm" disabled={pending} onClick={retryRefresh}>Обновить</Button></div>}
      <Card role="region" aria-label="Измерения" className="flex min-w-0 flex-col px-4 py-5 sm:px-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[17px] font-semibold">Измерения</h2>
          <span className="text-xs text-muted-foreground">последние записи · <Link href={`/pet/${pet.id}/measurements/parameters`} className="font-semibold text-foreground underline underline-offset-4">параметры</Link></span>
        </div>
        <div>
          <MeasurementRow name="Вес" unit="кг" history={weightHistory} currentValue={pet.weight_g == null ? null : pet.weight_g / 1000} pending={pending} onAdd={() => setEditor({ kind: "weight" })}>
            {editor?.kind === "weight" && <MeasurementEditor key="weight" name="Вес" unit="кг" weight initialValue={pet.weight_g == null ? "" : String(pet.weight_g / 1000).replace(".", ",")} pending={pending} onSave={save} onCancel={() => setEditor(null)} />}
          </MeasurementRow>
          {(showAll ? parameters : []).map((parameter) => {
            const latest = parameter.history[parameter.history.length - 1];
            const editing = editor?.kind === "parameter" && editor.id === parameter.id;
            return <MeasurementRow key={parameter.id} name={parameter.name} unit={parameter.unit} history={parameter.history} pending={pending} onAdd={() => openParameter(parameter.id, "add")} onEdit={latest ? () => openParameter(parameter.id, "edit") : undefined}>
              {editing && <MeasurementEditor key={`${parameter.id}-${editor.mode}`} name={parameter.name} unit={parameter.unit} rename={editor.mode === "edit"} initialValue={editor.mode === "edit" ? String(latest.value).replace(".", ",") : ""} initialDate={editor.date} pending={pending} onSave={save} onCancel={() => setEditor(null)} />}
            </MeasurementRow>;
          })}
        </div>
        {parameters.length > 0 && <Button type="button" variant="secondary" className="mt-2 w-full" disabled={pending} aria-expanded={showAll} onClick={() => { setShowAll(!showAll); setEditor(null); }}>
          {showAll ? "Свернуть" : `Показать все ${parameters.length + 1}`}<ChevronDownIcon aria-hidden="true" className={cn("transition-transform", showAll && "rotate-180")} />
        </Button>}
      </Card>
      {!embedded && <PetWeightChart key={`${pet.id}-${pet.weight_g}`} petId={pet.id} />}
    </>
  );
}
