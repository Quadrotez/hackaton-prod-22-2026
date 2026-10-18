"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

export type MeasurementDraft = { name: string; value: number; measured_at?: string };

export function MeasurementEditor({ name, unit, initialValue = "", initialDate = "", rename = false, weight = false, pending, onSave, onCancel }: {
  name: string; unit: string | null; initialValue?: string; initialDate?: string; rename?: boolean; weight?: boolean;
  pending: boolean; onSave: (draft: MeasurementDraft) => Promise<void>; onCancel: () => void;
}) {
  const id = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    const text = String(fields.get("value") ?? "").trim();
    const value = Number(text.replace(",", "."));
    const nextName = rename ? String(fields.get("name") ?? "").trim() : name;
    const date = new Date(String(fields.get("date") ?? ""));
    const issues: Record<string, string> = {};
    if (!nextName || nextName.length > 100) issues.name = "Укажите название до 100 символов";
    if (!text || !Number.isFinite(value)) issues.value = "Введите числовое значение";
    if (weight && (!Number.isFinite(value) || value < 0.001 || value > 1000)) issues.value = "Укажите вес от 0,001 до 1000 кг";
    if (!weight && Number.isNaN(date.getTime())) issues.date = "Укажите дату и время измерения";
    setErrors(issues);
    if (Object.keys(issues).length) return;
    await onSave({ name: nextName, value, ...(!weight && { measured_at: date.toISOString() }) });
  }

  return (
    <form onSubmit={submit} noValidate aria-label={`Измерение: ${name}`} aria-busy={pending} className="rounded-xl bg-black/2 p-3 dark:bg-white/3">
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">
        {!rename && <p className="text-sm font-semibold">{name}</p>}
        {rename && <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor={`${id}-name`}>Название</FieldLabel>
          <Input id={`${id}-name`} name="name" defaultValue={name} maxLength={100} aria-invalid={!!errors.name} aria-describedby={errors.name ? `${id}-name-error` : undefined} />
          {errors.name && <FieldError id={`${id}-name-error`}>{errors.name}</FieldError>}
        </Field>}
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Field data-invalid={!!errors.value}>
            <FieldLabel htmlFor={`${id}-value`}>Значение{unit && `, ${unit}`}</FieldLabel>
            <Input id={`${id}-value`} name="value" defaultValue={initialValue} inputMode="decimal" placeholder={unit ? `Новое значение, ${unit}` : "Новое значение"} autoFocus required maxLength={30} aria-invalid={!!errors.value} aria-describedby={errors.value ? `${id}-value-error` : undefined} />
            {errors.value && <FieldError id={`${id}-value-error`}>{errors.value}</FieldError>}
          </Field>
          {!weight && <Field data-invalid={!!errors.date}>
            <FieldLabel htmlFor={`${id}-date`}>Дата и время</FieldLabel>
            <Input id={`${id}-date`} name="date" type="datetime-local" defaultValue={initialDate} required aria-invalid={!!errors.date} aria-describedby={errors.date ? `${id}-date-error` : undefined} />
            {errors.date && <FieldError id={`${id}-date-error`}>{errors.date}</FieldError>}
          </Field>}
        </div>
        {weight && <p className="text-xs text-muted-foreground">Новый вес сохранится в профиле и истории измерений.</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>{pending && <Spinner />}Сохранить</Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onCancel}>Отмена</Button>
        </div>
      </fieldset>
    </form>
  );
}
