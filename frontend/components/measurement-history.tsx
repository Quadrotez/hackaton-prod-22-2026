"use client";

import { measurementValue, type MeasurementPoint } from "@/lib/measurements";
import { pluralize } from "@/lib/pets";
import { MeasurementSeriesChart } from "@/components/measurement-series-chart";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

export function MeasurementHistory({ name, unit, history }: { name: string; unit: string | null; history: MeasurementPoint[] }) {
  if (!history.length) return <span className="text-xs text-muted-foreground">История пуста</span>;
  const recent = history.slice(-8);
  const values = recent.map((point) => point.value);
  const min = Math.min(...values), max = Math.max(...values);
  const points = recent.map((point, index) => ({
    x: recent.length === 1 ? 55 : 4 + index / (recent.length - 1) * 102,
    y: max === min ? 18 : 31 - (point.value - min) / (max - min) * 26,
  }));
  const last = points[points.length - 1];

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={200}
        aria-label={`История: ${name}`}
        className="shrink-0 cursor-zoom-in rounded-lg p-1 outline-none transition-colors hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-foreground"
      >
        <svg width="110" height="36" viewBox="0 0 110 36" fill="none" aria-hidden="true">
          <polyline points={points.map(({ x, y }) => `${x},${y}`).join(" ")} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={last.x} cy={last.y} r="3" fill="currentColor" />
        </svg>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" sideOffset={8} className="w-[min(560px,calc(100vw-32px))] gap-1 rounded-[14px] border border-border p-4 ring-0">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <PopoverTitle>{name}</PopoverTitle>
          <span className="text-xs text-muted-foreground">Сейчас {measurementValue(history[history.length - 1].value, unit)}</span>
        </div>
        <PopoverDescription className="text-xs">История за {recent.length} {pluralize(recent.length, "запись", "записи", "записей")} · листайте график вправо</PopoverDescription>
        <MeasurementSeriesChart name={name} unit={unit} history={recent} />
      </PopoverContent>
    </Popover>
  );
}
