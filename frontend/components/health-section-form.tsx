"use client";

import { useId, useState, type FormEvent } from "react";
import { healthFields, healthFormDefaults, healthSchemas } from "@/lib/health-form";
import { recordTitle, type HealthRecord, type HealthResource, type HealthSectionData } from "@/lib/health-sections";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

export function HealthSectionForm({ data, resource, record, history, pending, onSave, onCancel }: {
  data: HealthSectionData; resource: HealthResource; record?: HealthRecord; history: boolean; pending: boolean;
  onSave: (body: unknown) => Promise<boolean>; onCancel: () => void;
}) {
  const id = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const defaults = healthFormDefaults(data, resource, record, history);
  // Чекбоксы, от которых зависят другие поля (например, «Время не указано» отключает время).
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(
    healthFields[resource].filter((field) => field.type === "checkbox").map((field) => [field.name, defaults[field.name] === "on"]),
  ));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(healthFields[resource].map((field) => [field.name, form.get(field.name) ?? ""]));
    const result = healthSchemas[resource].safeParse(values);
    if (!result.success) {
      const issues: Record<string, string> = {};
      for (const issue of result.error.issues) { const field = String(issue.path[0]); if (!issues[field]) issues[field] = issue.message; }
      setErrors(issues);
      return;
    }
    setErrors({});
    await onSave(result.data);
  }
  return <Card role="region" aria-label={record ? `Изменить: ${recordTitle(record)}` : "Новая запись"} className="space-y-4">
    <h2>{record ? "Изменить запись" : resource === "allergies" ? "Добавить аллергию" : "Новая запись"}</h2>
    <form onSubmit={submit} noValidate aria-busy={pending}>
      <FieldSet disabled={pending}><FieldGroup className="gap-4">
        {healthFields[resource].map((field, index) => {
          const fieldId = `${id}-${field.name}`;
          if (field.type === "checkbox") return <Field key={field.name} orientation="horizontal">
            <input id={fieldId} name={field.name} type="checkbox" checked={checked[field.name] ?? false}
              onChange={(event) => { const value = event.target.checked; setChecked((current) => ({ ...current, [field.name]: value })); }}
              className="size-4 shrink-0 accent-primary" />
            <FieldLabel htmlFor={fieldId} className="font-normal">{field.label}</FieldLabel>
          </Field>;
          const disabled = field.disabledBy ? Boolean(checked[field.disabledBy]) : false;
          return <Field key={field.name} data-invalid={Boolean(errors[field.name])} data-disabled={disabled || undefined}>
            <FieldLabel htmlFor={fieldId}>{field.label}</FieldLabel>
            {field.options ? <select id={fieldId} name={field.name} defaultValue={defaults[field.name]} aria-invalid={Boolean(errors[field.name])} aria-describedby={errors[field.name] ? `${fieldId}-error` : undefined} className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50">
              {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select> : field.type === "textarea" ? <textarea id={fieldId} name={field.name} defaultValue={defaults[field.name] ?? ""} rows={3} required={field.required} maxLength={field.maxLength} autoFocus={index === 0} aria-invalid={Boolean(errors[field.name])} aria-describedby={errors[field.name] ? `${fieldId}-error` : undefined} className="min-h-24 w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50" /> : <Input id={fieldId} name={field.name} type={field.type ?? "text"} required={field.required} maxLength={field.maxLength} min={field.min} max={field.max} step={field.type === "number" ? 1 : undefined} placeholder={field.placeholder} defaultValue={defaults[field.name] ?? ""} disabled={disabled} autoFocus={index === 0} aria-invalid={Boolean(errors[field.name])} aria-describedby={errors[field.name] ? `${fieldId}-error` : undefined} />}
            <FieldError id={`${fieldId}-error`}>{errors[field.name]}</FieldError>
          </Field>;
        })}
        <div className="flex flex-wrap gap-2"><Button type="submit" size="lg" variant="secondary" className="theme-shadcn" disabled={pending}>{pending && <Spinner />}Сохранить</Button><Button type="button" size="lg" variant="secondary" className="theme-shadcn" disabled={pending} onClick={onCancel}>Отмена</Button></div>
      </FieldGroup></FieldSet>
    </form>
  </Card>;
}
