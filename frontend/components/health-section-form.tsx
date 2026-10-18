"use client";

import { useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { getErrorMessage } from "@/lib/api";
import { PHOTO_TYPES, validatePhoto } from "@/lib/photos";
import { healthFields, healthFormDefaults, healthSchemas } from "@/lib/health-form";
import { analyzeVetDocument, recordTitle, type HealthRecord, type HealthResource, type HealthSectionData } from "@/lib/health-sections";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { FileScanIcon } from "lucide-react";

export function HealthSectionForm({ data, resource, record, history, pending, onSave, onCancel }: {
  data: HealthSectionData; resource: HealthResource; record?: HealthRecord; history: boolean; pending: boolean;
  onSave: (body: unknown) => Promise<boolean>; onCancel: () => void;
}) {
  const id = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState("");
  const diagnosisRef = useRef<HTMLTextAreaElement | null>(null);
  const defaults = healthFormDefaults(data, resource, record, history);
  // Чекбоксы, от которых зависят другие поля (например, «Время не указано» отключает время).
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(
    healthFields[resource].filter((field) => field.type === "checkbox").map((field) => [field.name, defaults[field.name] === "on"]),
  ));
  async function scanDocument(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const fileError = validatePhoto(file);
    if (fileError) { setScanNote(fileError); return; }
    setScanNote("");
    setScanning(true);
    try {
      const result = await analyzeVetDocument(data.pet.id, file);
      if (result.status === "error" || !result.post_visit_instructions) {
        setScanNote(result.error_code === "UNREADABLE_IMAGE" ? "Не удалось прочитать текст на фото. Попробуйте сделать снимок чётче" : "В документе не найдено заключение. Введите его вручную");
      } else if (diagnosisRef.current) {
        diagnosisRef.current.value = result.post_visit_instructions.slice(0, 5000);
        setScanNote("Заключение распознано. Проверьте текст и при необходимости поправьте.");
      }
    } catch (error) {
      setScanNote(getErrorMessage(error, "Не удалось расшифровать документ. Введите заключение вручную"));
    } finally {
      setScanning(false);
    }
  }
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
            </select> : field.type === "textarea" ? <textarea id={fieldId} name={field.name} ref={field.name === "diagnosis" ? diagnosisRef : undefined} defaultValue={defaults[field.name] ?? ""} rows={3} required={field.required} maxLength={field.maxLength} autoFocus={index === 0} aria-invalid={Boolean(errors[field.name])} aria-describedby={errors[field.name] ? `${fieldId}-error` : undefined} className="min-h-24 w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50" /> : <Input id={fieldId} name={field.name} type={field.type ?? "text"} required={field.required} maxLength={field.maxLength} min={field.min} max={field.max} step={field.type === "number" ? 1 : undefined} placeholder={field.placeholder} defaultValue={defaults[field.name] ?? ""} disabled={disabled} autoFocus={index === 0} aria-invalid={Boolean(errors[field.name])} aria-describedby={errors[field.name] ? `${fieldId}-error` : undefined} />}
            {resource === "visits" && field.name === "diagnosis" && <div className="flex flex-col gap-2">
              <label className="relative inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-card px-3 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-default has-disabled:opacity-50 sm:w-auto">
                <input type="file" accept={PHOTO_TYPES.filter((type) => type !== "image/gif").join(",")} disabled={scanning} onChange={scanDocument} className="sr-only" />
                {scanning ? <><Spinner />Читаем документ…</> : <><FileScanIcon size={14} />Прочитать с фото эпикриза</>}
              </label>
              {scanNote && <p role="status" className="text-xs text-muted-foreground">{scanNote}</p>}
            </div>}
            <FieldError id={`${fieldId}-error`}>{errors[field.name]}</FieldError>
          </Field>;
        })}
        <div className="flex flex-wrap gap-2"><Button type="submit" size="lg" variant="secondary" className="theme-shadcn" disabled={pending}>{pending && <Spinner />}Сохранить</Button><Button type="button" size="lg" variant="secondary" className="theme-shadcn" disabled={pending} onClick={onCancel}>Отмена</Button></div>
      </FieldGroup></FieldSet>
    </form>
  </Card>;
}
