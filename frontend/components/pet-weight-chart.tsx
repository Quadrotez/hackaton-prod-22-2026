"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useProtectedData } from "@/hooks/use-auth";
import { getPetWeightHistory, weightChartData, type PetWeight } from "@/lib/pet-weight";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { MeasurementSeriesChart } from "@/components/measurement-series-chart";

const kilos = (value: number) => `${value.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} кг`;
const fullDate = (timestamp: number) => new Date(timestamp).toLocaleString("ru-RU", {
  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export function PetWeightChart({ petId }: { petId: number }) {
  const load = useCallback(() => getPetWeightHistory(petId), [petId]);
  const state = useProtectedData(load, "Не удалось загрузить историю веса");

  return (
    <Card role="region" aria-label="Динамика веса" className="flex min-w-0 flex-col gap-3 px-4 py-5 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold">Динамика веса</h2>
        <Link href={`/pet/${petId}/measurements`} className="text-xs font-semibold underline underline-offset-4">Все измерения</Link>
      </div>
      {state.status === "loading" ? (
        <div role="status" className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner />Загружаем измерения…
        </div>
      ) : state.status === "error" ? (
        <div role="alert" className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">{state.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={state.retry}>Попробовать ещё раз</Button>
        </div>
      ) : state.data.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Измерений пока нет. Укажите вес при редактировании питомца — здесь появится график.
        </div>
      ) : (
        <WeightHistory history={state.data} />
      )}
    </Card>
  );
}

function WeightHistory({ history }: { history: PetWeight[] }) {
  const data = weightChartData(history);
  const first = data[0];
  const last = data[data.length - 1];
  const change = last.weight - first.weight;
  const points = data.map((entry) => ({ value: entry.weight, measured_at: new Date(entry.timestamp).toISOString() }));

  return (
    <>
      <p className="text-xs text-muted-foreground">Сейчас {kilos(last.weight)}{data.length > 5 && " · листайте график вправо"}</p>
      <MeasurementSeriesChart name="Вес" unit="кг" history={points} area />
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium">{data.length === 1 ? `Первое измерение: ${kilos(last.weight)}` : `Изменение за период: ${change > 0 ? "+" : ""}${kilos(change)}`}</p>
        <p className="text-xs text-muted-foreground">
          {data.length === 1 ? "Добавьте ещё одно измерение, чтобы увидеть изменение веса." : `${fullDate(first.timestamp)} — ${fullDate(last.timestamp)}`}
        </p>
      </div>
    </>
  );
}
