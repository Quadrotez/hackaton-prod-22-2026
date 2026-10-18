"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { endPregnancy, formatHealthDate, savePregnancy, type Pregnancy } from "@/lib/health-sections";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function PregnancyCard({ petId, pregnancy, onChanged, readOnly = false }: { petId: number; pregnancy: Pregnancy | null; onChanged: () => Promise<void>; readOnly?: boolean }) {
  const { handleAuthError } = useRequireAuth();
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);

  async function run(action: () => Promise<unknown>, message: string) {
    if (pending) return;
    setPending(true);
    try {
      await action();
      toast.success(message);
      setEditing(false);
      await onChanged();
    } catch (error) {
      if (!handleAuthError(error)) toast.error(getErrorMessage(error, "Не удалось сохранить изменения. Попробуйте ещё раз"));
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const month = Number(new FormData(event.currentTarget).get("month"));
    await run(() => savePregnancy(petId, month), pregnancy ? "Срок беременности обновлён" : "Беременность отмечена");
  }

  return <Card role="region" aria-label="Беременность" className="flex flex-col gap-3">
    <h2 className="text-[17px] font-semibold">Беременность</h2>
    {pregnancy ? <div className="space-y-1">
      <p className="text-2xl font-semibold tabular-nums">{pregnancy.month} месяц из {MONTHS.length}</p>
      <p className="text-xs text-muted-foreground">Начало: {formatHealthDate(pregnancy.started_on)}</p>
    </div> : <p className="text-sm text-muted-foreground">Беременность не отмечена.</p>}
    {editing ? <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Текущий месяц
        <select name="month" defaultValue={pregnancy?.month ?? 1} disabled={pending} className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50">
          {MONTHS.map((month) => <option key={month} value={month}>{month}</option>)}
        </select>
      </label>
      <Button type="submit" className="theme-shadcn" disabled={pending}>{pending && <Spinner />}Сохранить</Button>
      <Button type="button" variant="secondary" className="theme-shadcn" disabled={pending} onClick={() => setEditing(false)}>Отмена</Button>
    </form> : readOnly ? null : <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" className="theme-shadcn" disabled={pending} onClick={() => setEditing(true)}>{pregnancy ? "Изменить месяц" : "Отметить беременность"}</Button>
      {pregnancy && <Button type="button" variant="secondary" className="theme-shadcn" disabled={pending} onClick={() => run(() => endPregnancy(petId), "Беременность завершена")}>Завершить</Button>}
    </div>}
  </Card>;
}
