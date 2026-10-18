"use client";

import { PencilIcon, Trash2Icon, CheckIcon } from "lucide-react";
import { recordTitle, recordDate, recordIsHistory, formatHealthDate, dueBadge, type HealthRecord } from "@/lib/health-sections";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const reasonLabels = { illness: "Болезнь или жалоба", examination: "Осмотр", vaccination: "Вакцинация", checkup: "Контрольный приём" };
const parasiteLabels = { internal: "Внутренние паразиты", external: "Наружные (блохи, клещи)" };
export function HealthRecordCard({ record, today, pending, onEdit, onDelete, onComplete }: {
  record: HealthRecord; today: string; pending: boolean; onEdit: () => void; onDelete: () => void; onComplete: () => void;
}) {
  const status = record.resource === "visits" ? { planned: "Запланирован", completed: "Состоялся", cancelled: "Отменён" }[record.value.status]
    : record.resource === "vaccinations" ? record.value.status === "done" ? "Сделана" : "Запланирована"
    : record.resource === "medications" ? recordIsHistory(record, today) ? "Курс завершён" : record.value.start_date > today ? "Начнётся позже" : "Текущий курс" : null;
  const nextDue = record.resource === "parasites" || record.resource === "vaccinations" ? dueBadge(record.value.next_due_on, today) : null;
  const canComplete = (record.resource === "visits" && record.value.status === "planned") || (record.resource === "vaccinations" && record.value.status === "planned");
  const kind = { visits: "visit", vaccinations: "vaccine", medications: "medicine", symptoms: "symptom", allergies: "allergy", parasites: "parasite" }[record.resource];
  return <Card id={`health-${kind}-${record.value.id}`} className="flex min-w-0 scroll-mt-6 flex-col gap-3 target:ring-2 target:ring-primary">
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><h2 className="break-words">{recordTitle(record)}</h2><p className="mt-1 text-xs text-muted-foreground">{formatHealthDate(recordDate(record), record.resource === "visits" || record.resource === "symptoms")}</p></div><div className="flex flex-wrap items-center gap-2">{nextDue && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-900">{nextDue}</span>}{status && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs">{status}</span>}</div></div>
    {record.resource === "visits" && <div className="space-y-2 break-words text-sm"><p>{reasonLabels[record.value.reason]}</p>{record.value.doctor_name && <p><span className="font-semibold">Врач:</span> {record.value.doctor_name}{record.value.doctor_specialty && ` · ${record.value.doctor_specialty}`}</p>}{record.value.topic && <p><span className="font-semibold">Жалоба:</span> {record.value.topic}</p>}{record.value.diagnosis && <p className="rounded-lg bg-background p-3"><span className="font-semibold">Заключение:</span> {record.value.diagnosis}</p>}{record.value.notes && <p className="text-muted-foreground">{record.value.notes}</p>}</div>}
    {record.resource === "vaccinations" && <div className="space-y-1 break-words text-sm">{record.value.clinic && <p>{record.value.clinic}</p>}{record.value.next_due_on && <p><span className="font-semibold">Следующая:</span> {formatHealthDate(record.value.next_due_on)}</p>}{record.value.notes && <p className="text-muted-foreground">{record.value.notes}</p>}</div>}
    {record.resource === "parasites" && <div className="space-y-1 break-words text-sm"><p>{parasiteLabels[record.value.kind]}</p>{record.value.interval_days && <p><span className="font-semibold">Интервал:</span> {record.value.interval_days} дн.</p>}{record.value.next_due_on && <p><span className="font-semibold">Следующая обработка:</span> {formatHealthDate(record.value.next_due_on)}</p>}{record.value.clinic && <p>{record.value.clinic}</p>}{record.value.notes && <p className="text-muted-foreground">{record.value.notes}</p>}</div>}
    {record.resource === "medications" && <div className="space-y-1 break-words text-sm"><p className="font-semibold">{record.value.dose}</p><p><span className="font-semibold">Время:</span> {record.value.times.map((time) => time.slice(0, 5)).join(", ")}</p><p>{record.value.interval_days === 1 ? "Ежедневно" : `Каждые ${record.value.interval_days} дн.`}{record.value.end_date ? ` · до ${formatHealthDate(record.value.end_date)}` : " · без даты окончания"}</p>{record.value.notes && <p className="text-muted-foreground">{record.value.notes}</p>}</div>}
    {record.resource === "allergies" && <div className="space-y-1 break-words text-sm">{record.value.reactions && <p><span className="font-semibold">Реакция:</span> {record.value.reactions}</p>}{record.value.notes && <p className="text-muted-foreground">{record.value.notes}</p>}</div>}
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      {canComplete && <Button type="button" variant="secondary" className="theme-shadcn" disabled={pending} onClick={onComplete}><CheckIcon aria-hidden="true" />{record.resource === "visits" ? "Приём состоялся" : "Прививка сделана"}</Button>}
      <Button type="button" variant="secondary" className="theme-shadcn" size="sm" disabled={pending} onClick={onEdit}><PencilIcon aria-hidden="true" />Изменить</Button>
      <Button type="button" variant="secondary" className="theme-shadcn ml-auto" size="icon" disabled={pending} onClick={onDelete} aria-label={`Удалить: ${recordTitle(record)}`}><Trash2Icon aria-hidden="true" /></Button>
    </div>
  </Card>;
}
