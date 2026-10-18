"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { LockKeyholeIcon } from "lucide-react";
import { toast } from "sonner";
import { useProtectedData, useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { isCaretaker } from "@/lib/pets";
import { addMeasurementParameter, deleteMeasurementParameter, loadMeasurementParameters, type MeasurementParameter, type MeasurementParametersData } from "@/lib/measurements";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function MeasurementParametersPage({ petId }: { petId: number }) {
  const load = useCallback(() => loadMeasurementParameters(petId), [petId]);
  const state = useProtectedData(load, "Не удалось загрузить параметры измерений");
  if (state.status === "loading" || (state.status === "ready" && state.data.pet.id !== petId)) return <PageLoading />;
  if (state.status === "error") return <PageError message={state.error} onRetry={state.retry} backToList />;
  return <ParametersContent key={petId} data={state.data} onUpdate={state.update} />;
}

function ParametersContent({ data, onUpdate }: { data: MeasurementParametersData; onUpdate: (data: MeasurementParametersData) => void }) {
  const { pet, parameters } = data;
  const caretaker = isCaretaker(pet);
  const id = useId();
  const { handleAuthError } = useRequireAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<MeasurementParameter | null>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const name = String(fields.get("name") ?? "").trim();
    const unit = String(fields.get("unit") ?? "").trim();
    if (!name || name.length > 100) { setError("Укажите название параметра до 100 символов"); return; }
    if (unit.length > 20) { setError("Единица измерения — не больше 20 символов"); return; }
    const key = name.toLocaleLowerCase("ru-RU");
    if (key === "вес" || parameters.some((item) => item.name.toLocaleLowerCase("ru-RU") === key)) {
      setError("Такой параметр уже есть. Выберите другое название."); return;
    }
    setError("");
    setPending(true);
    try {
      const parameter = await addMeasurementParameter(pet.id, { name, unit: unit || null });
      onUpdate({ pet, parameters: [...parameters, parameter].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id) });
      form.reset();
      form.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
      toast.success("Параметр добавлен");
    } catch (error) {
      if (!handleAuthError(error)) setError(getErrorMessage(error, "Не удалось добавить параметр"));
    } finally { setPending(false); }
  }
  async function remove() {
    if (!deleting || pending) return;
    setPending(true);
    try {
      await deleteMeasurementParameter(pet.id, deleting.id);
      onUpdate({ pet, parameters: parameters.filter((item) => item.id !== deleting.id) });
      setDeleting(null);
      toast.success("Параметр удалён");
    } catch (error) {
      if (!handleAuthError(error)) toast.error(getErrorMessage(error, "Не удалось удалить параметр"));
    } finally { setPending(false); }
  }

  return (
    <>
      <PageHeader title="Параметры измерений" backHref={`/pet/${pet.id}/measurements`} />
      <Card role="region" aria-label="Список параметров" className="flex flex-col gap-2 px-4 py-5 sm:px-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-semibold">Показатели</h2>
          <span className="text-sm text-muted-foreground">Всего: {parameters.length + 1}</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t py-3">
          <div><p className="font-semibold">Вес</p><p className="text-xs text-muted-foreground">кг · из профиля питомца</p></div>
          <LockKeyholeIcon aria-label="Постоянный показатель профиля" className="mr-3 size-4 text-muted-foreground" />
        </div>
        {parameters.map((parameter) => <div key={parameter.id} className="flex items-center justify-between gap-3 border-t py-3">
          <div className="min-w-0"><p className="break-words font-semibold">{parameter.name}</p><p className="text-xs text-muted-foreground">{parameter.unit || "без единиц"}</p></div>
          {!caretaker && <Button type="button" variant="outline" size="sm" className="shrink-0 text-destructive hover:text-destructive" disabled={pending} onClick={() => setDeleting(parameter)} aria-label={`Удалить ${parameter.name}`}>Удалить</Button>}
        </div>)}
      </Card>
      {!caretaker && <Card role="region" aria-label="Новый параметр" className="flex flex-col gap-4 px-4 py-5 sm:px-5">
        <h2 className="text-[17px] font-semibold">Новый параметр</h2>
        <form onSubmit={add} noValidate aria-busy={pending}>
          <fieldset disabled={pending} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field className="min-w-0 flex-1" data-invalid={!!error}>
              <FieldLabel htmlFor={`${id}-name`}>Название</FieldLabel>
              <Input id={`${id}-name`} name="name" className="h-11" placeholder="Например, окружность лапы" maxLength={100} required aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={() => setError("")} />
            </Field>
            <Field className="min-w-0 sm:w-32">
              <FieldLabel htmlFor={`${id}-unit`}>Единица</FieldLabel>
              <Input id={`${id}-unit`} name="unit" className="h-11" placeholder="Например, см" maxLength={20} onChange={() => setError("")} />
            </Field>
            <Button type="submit" size="lg" className="h-11" disabled={pending}>{pending && <Spinner />}Добавить</Button>
          </fieldset>
          {error && <FieldError id={`${id}-error`} className="mt-3">{error}</FieldError>}
        </form>
      </Card>}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open && !pending) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить параметр?</AlertDialogTitle>
            <AlertDialogDescription>«{deleting?.name}» и вся история этого показателя будут удалены.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={remove}>{pending && <Spinner />}Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
