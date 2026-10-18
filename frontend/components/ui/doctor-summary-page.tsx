"use client";

import { useCallback } from "react";
import { PrinterIcon, TriangleAlertIcon } from "lucide-react";
import { useProtectedData } from "@/hooks/use-auth";
import { formatPetAge, formatWeight, getSpeciesLabel, sexOptions } from "@/lib/pets";
import { loadDoctorSummary, formatHealthDate, dueBadge, type DoctorSummaryData } from "@/lib/health-sections";
import { measurementValue } from "@/lib/measurements";
import { formatVisitAt } from "@/lib/visit-time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { PetAvatar } from "@/components/pet-avatar";
import { MeasurementSeriesChart } from "@/components/measurement-series-chart";

const reasonLabels = { illness: "Болезнь или жалоба", examination: "Осмотр", vaccination: "Вакцинация", checkup: "Контрольный приём" };
const parasiteLabels = { internal: "Внутренние паразиты", external: "Наружные паразиты" };
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function DoctorSummaryPage({ petId }: { petId: number }) {
  const load = useCallback(() => loadDoctorSummary(petId), [petId]);
  const state = useProtectedData(load, "Не удалось собрать сводку для врача");
  if (state.status === "loading" || (state.status === "ready" && state.data.pet.id !== petId)) return <PageLoading />;
  if (state.status === "error") return <PageError message={state.error} onRetry={state.retry} backToList />;
  return <DoctorSummaryContent data={state.data} />;
}

function StatTile({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <Card variant={accent ? "accent" : "default"} className="flex flex-col gap-0.5 break-inside-avoid">
      <p className={cn("text-sm", !accent && "text-muted-foreground")}>{label}</p>
      <p className="text-2xl font-semibold leading-tight tracking-tight tabular-nums">{value}</p>
      <p className={cn("text-xs", !accent && "text-muted-foreground")}>{hint}</p>
    </Card>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <Card role="region" aria-label={title} className="flex min-w-0 flex-col gap-3 break-inside-avoid">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs tabular-nums">{count}</span>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </Card>
  );
}

function Row({ title, date, badge, children }: { title: string; date: string; badge?: string | null; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t pt-3 text-sm first-of-type:border-t-0 first-of-type:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 break-words font-medium">{title}</p>
        <p className="shrink-0 text-xs text-muted-foreground tabular-nums">{date}</p>
      </div>
      {badge && <span className="w-fit rounded-full bg-amber-100 px-2.5 py-0.5 text-xs text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">{badge}</span>}
      {children && <div className="space-y-0.5 break-words text-muted-foreground">{children}</div>}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

function DoctorSummaryContent({ data }: { data: DoctorSummaryData }) {
  const { pet, today } = data;
  const byDateDesc = <T,>(date: (item: T) => string) => (first: T, second: T) => date(second).localeCompare(date(first));

  const weights = [...data.weights].reverse();
  const lastWeight = weights[0];
  const yearAgo = Date.parse(`${today}T00:00:00`) - YEAR_MS;
  const weightYearAgo = data.weights.find((entry) => Date.parse(entry.measured_at) >= yearAgo);
  const weightChange = lastWeight && weightYearAgo && weightYearAgo.id !== lastWeight.id ? lastWeight.weight_g - weightYearAgo.weight_g : null;
  const currentWeight = lastWeight?.weight_g ?? pet.weight_g;

  const vaccinesDone = data.vaccinations.filter((item) => item.status === "done").sort(byDateDesc((item) => item.scheduled_on));
  const vaccinesPlanned = data.vaccinations.filter((item) => item.status === "planned").sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on));
  const visitsPast = data.visits.filter((item) => item.status === "completed").sort(byDateDesc((item) => item.visit_at));
  const visitsPlanned = data.visits.filter((item) => item.status === "planned").sort((a, b) => a.visit_at.localeCompare(b.visit_at));
  const visitsYear = visitsPast.filter((item) => Date.parse(item.visit_at) >= yearAgo).length;
  const activeMeds = data.medications.filter((item) => item.start_date <= today && (item.end_date === null || item.end_date >= today));
  const pastMeds = data.medications.filter((item) => item.end_date !== null && item.end_date < today).sort(byDateDesc((item) => item.end_date ?? ""));
  const symptoms = [...data.symptoms].sort(byDateDesc((item) => item.observed_at));
  // Для каждого типа паразитов врачу важна только последняя обработка.
  const lastParasites = (["external", "internal"] as const)
    .map((kind) => data.parasites.filter((item) => item.kind === kind).sort(byDateDesc((item) => item.treated_on))[0])
    .filter((item) => item !== undefined);
  const parameters = data.parameters.filter((parameter) => parameter.history.length > 0);

  const passport = [
    ["Вид", getSpeciesLabel(pet.species)],
    ["Порода", pet.breed ?? "не указана"],
    ["Пол", sexOptions.find((option) => option.value === pet.sex)?.label ?? "—"],
    ["Возраст", formatPetAge(pet) ?? "не указан"],
    ["Дата рождения", pet.birth_date ? formatHealthDate(pet.birth_date) : "не указана"],
    ["Вес", currentWeight != null ? formatWeight(currentWeight) : "не указан"],
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageHeader title="Для врача" description={`Сводка на ${formatHealthDate(today)}`} backHref={`/pet/${pet.id}/health`} />
        <Button type="button" variant="secondary" className="theme-shadcn shrink-0 hover:bg-background print:hidden" onClick={() => window.print()}>
          <PrinterIcon aria-hidden="true" />Печать
        </Button>
      </div>

      <Card className="flex flex-col gap-4 break-inside-avoid">
        <div className="flex items-center gap-4">
          <PetAvatar pet={pet} />
          <div className="min-w-0">
            <h2 className="truncate">{pet.name}</h2>
            <p className="text-sm text-muted-foreground">Карточка питомца</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-sm sm:grid-cols-3">
          {passport.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="break-words font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {data.pregnancy && (
          <p className="rounded-lg bg-background p-3 text-sm"><span className="font-semibold">Беременность:</span> {data.pregnancy.month}-й месяц, с {formatHealthDate(data.pregnancy.started_on)}</p>
        )}
      </Card>

      {data.allergies.length > 0 && (
        <Card variant="accent" role="region" aria-label="Аллергии" className="flex flex-col gap-2 break-inside-avoid">
          <div className="flex items-center gap-2">
            <TriangleAlertIcon aria-hidden="true" className="size-5" strokeWidth={1.75} />
            <h2 className="text-[17px] font-semibold">Аллергии</h2>
          </div>
          <ul className="space-y-1 text-sm">
            {data.allergies.map((allergy) => (
              <li key={allergy.id}><span className="font-semibold">{allergy.allergen}</span>{allergy.reactions && ` — ${allergy.reactions}`}{allergy.notes && ` (${allergy.notes})`}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          accent
          label="Вес за год"
          value={weightChange != null ? `${weightChange > 0 ? "+" : weightChange < 0 ? "−" : ""}${formatWeight(Math.abs(weightChange))}` : "—"}
          hint={weightChange != null && weightYearAgo ? `с ${formatHealthDate(weightYearAgo.measured_at.slice(0, 10))}` : "недостаточно измерений"}
        />
        <StatTile label="Приёмов за год" value={String(visitsYear)} hint={visitsPast[0] ? `последний ${formatVisitAt(visitsPast[0].visit_at)}` : "приёмов не было"} />
        <StatTile label="Прививок сделано" value={String(vaccinesDone.length)} hint={vaccinesDone[0] ? `последняя ${formatHealthDate(vaccinesDone[0].scheduled_on)}` : "записей нет"} />
        <StatTile label="Текущих лекарств" value={String(activeMeds.length)} hint={activeMeds.length ? activeMeds.map((item) => item.name).join(", ") : "курсов сейчас нет"} />
      </div>

      <Section title="Текущие лекарства" count={activeMeds.length}>
        {activeMeds.length ? activeMeds.map((item) => (
          <Row key={item.id} title={`${item.name} · ${item.dose}`} date={`с ${formatHealthDate(item.start_date)}`}>
            <p>{item.interval_days === 1 ? "Ежедневно" : `Каждые ${item.interval_days} дн.`} в {item.times.map((time) => time.slice(0, 5)).join(", ")}{item.end_date ? ` · до ${formatHealthDate(item.end_date)}` : " · без даты окончания"}</p>
            {item.notes && <p>{item.notes}</p>}
          </Row>
        )) : <Empty>Сейчас питомец не принимает лекарства.</Empty>}
      </Section>

      <Section title="История веса" count={data.weights.length}>
        {weights.length ? (
          <>
            <div className="print:hidden">
              <MeasurementSeriesChart name="Вес" unit="кг" history={data.weights.map((entry) => ({ value: entry.weight_g / 1000, measured_at: entry.measured_at }))} area />
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2 font-normal">Дата</th><th className="pb-2 text-right font-normal">Вес</th><th className="pb-2 text-right font-normal">Изменение</th></tr></thead>
              <tbody>
                {weights.slice(0, 10).map((entry, index) => {
                  const previous = weights[index + 1];
                  const diff = previous ? entry.weight_g - previous.weight_g : null;
                  return (
                    <tr key={entry.id} className="border-t">
                      <td className="py-2">{formatHealthDate(entry.measured_at.slice(0, 10))}</td>
                      <td className="py-2 text-right font-medium tabular-nums">{formatWeight(entry.weight_g)}</td>
                      <td className="py-2 text-right text-muted-foreground tabular-nums">{diff ? `${diff > 0 ? "+" : "−"}${formatWeight(Math.abs(diff))}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : <Empty>Измерений веса пока нет.</Empty>}
      </Section>

      {parameters.length > 0 && (
        <Section title="Другие показатели" count={parameters.length}>
          {parameters.map((parameter) => {
            const last = parameter.history[parameter.history.length - 1];
            return (
              <Row key={parameter.id} title={parameter.name} date={formatHealthDate(last.measured_at.slice(0, 10))}>
                <p><span className="font-semibold text-foreground">{measurementValue(last.value, parameter.unit)}</span>{parameter.history.length > 1 && ` · измерений: ${parameter.history.length}`}</p>
              </Row>
            );
          })}
        </Section>
      )}

      <Section title="Прививки" count={vaccinesDone.length}>
        {vaccinesDone.length ? vaccinesDone.map((item) => (
          <Row key={item.id} title={item.name} date={formatHealthDate(item.scheduled_on)} badge={dueBadge(item.next_due_on, today)}>
            {item.clinic && <p>{item.clinic}</p>}
            {item.next_due_on && <p>Следующая: {formatHealthDate(item.next_due_on)}</p>}
          </Row>
        )) : <Empty>Сделанных прививок не записано.</Empty>}
        {vaccinesPlanned.length > 0 && (
          <p className="border-t pt-3 text-sm"><span className="font-semibold">Запланированы:</span> {vaccinesPlanned.map((item) => `${item.name} (${formatHealthDate(item.scheduled_on)})`).join(", ")}</p>
        )}
      </Section>

      <Section title="Обработки от паразитов" count={data.parasites.length}>
        {lastParasites.length ? lastParasites.map((item) => (
          <Row key={item.id} title={`${parasiteLabels[item.kind]}: ${item.product_name}`} date={formatHealthDate(item.treated_on)} badge={dueBadge(item.next_due_on, today)}>
            {item.next_due_on && <p>Следующая: {formatHealthDate(item.next_due_on)}</p>}
          </Row>
        )) : <Empty>Обработок не записано.</Empty>}
      </Section>

      <Section title="Приёмы у врача" count={visitsPast.length}>
        {visitsPast.length ? visitsPast.map((item) => (
          <Row key={item.id} title={item.title} date={formatVisitAt(item.visit_at)}>
            <p>{reasonLabels[item.reason]}{item.doctor_name && ` · ${item.doctor_name}`}{item.doctor_specialty && `, ${item.doctor_specialty}`}</p>
            {item.topic && <p><span className="font-semibold text-foreground">Жалоба:</span> {item.topic}</p>}
            {item.diagnosis && <p className="rounded-lg bg-background p-3 text-foreground"><span className="font-semibold">Заключение:</span> {item.diagnosis}</p>}
          </Row>
        )) : <Empty>Состоявшихся приёмов не записано.</Empty>}
        {visitsPlanned.length > 0 && (
          <p className="border-t pt-3 text-sm"><span className="font-semibold">Запланированы:</span> {visitsPlanned.map((item) => `${item.title} (${formatVisitAt(item.visit_at)})`).join(", ")}</p>
        )}
      </Section>

      <Section title="Симптомы и наблюдения" count={symptoms.length}>
        {symptoms.length ? symptoms.slice(0, 10).map((item) => (
          <Row key={item.id} title={item.description} date={formatHealthDate(item.observed_at, true)} />
        )) : <Empty>Наблюдений не записано.</Empty>}
      </Section>

      {pastMeds.length > 0 && (
        <Section title="Завершённые курсы" count={pastMeds.length}>
          {pastMeds.slice(0, 10).map((item) => (
            <Row key={item.id} title={`${item.name} · ${item.dose}`} date={`${formatHealthDate(item.start_date)} — ${formatHealthDate(item.end_date ?? item.start_date)}`} />
          ))}
        </Section>
      )}
    </>
  );
}
