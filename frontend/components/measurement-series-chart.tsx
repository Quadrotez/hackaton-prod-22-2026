"use client";

import { Area, AreaChart, Tooltip, XAxis, YAxis } from "recharts";
import { measurementValue, type MeasurementPoint } from "@/lib/measurements";

export function MeasurementSeriesChart({ name, unit, history, area = false }: {
  name: string; unit: string | null; history: MeasurementPoint[]; area?: boolean;
}) {
  if (!history.length) return null;
  const values = history.map((point) => point.value);
  const min = Math.min(...values), max = Math.max(...values);
  const padding = Math.max((max - min) * 0.1, Math.abs(max) * 0.005, 0.001);
  const lower = min - padding;
  const upper = max + padding;
  const data = history.map((point) => ({ ...point, timestamp: Date.parse(point.measured_at) }));

  return (
    <div className="flex min-w-0" aria-label={`История измерений: ${name}`}>
      <div aria-hidden="true" className="relative h-60 w-16 shrink-0 text-[11px] text-muted-foreground">
        {[{ value: upper, top: 32 }, { value: (lower + upper) / 2, top: 116 }, { value: lower, top: 200 }].map(({ value, top }) => (
          <span key={top} title={measurementValue(value, unit)} className="absolute right-2 left-0 -translate-y-1/2 truncate text-right" style={{ top }}>{measurementValue(value, unit)}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain pb-1">
        <AreaChart
          accessibilityLayer
          width={Math.max(300, history.length * 80)}
          height={240}
          data={data}
          margin={{ top: 32, right: 40, left: 40, bottom: 20 }}
          aria-label={`${name}, ${history.length} измерений`}
        >
          <XAxis
            dataKey="timestamp"
            height={20}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval={0}
            tickMargin={10}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value: number) => new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
          />
          <YAxis hide domain={[lower, upper]} />
          <Tooltip
            cursor={false}
            labelFormatter={(value) => new Date(Number(value)).toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            formatter={(value) => [measurementValue(Number(value), unit), name]}
            contentStyle={{ borderRadius: 8, borderColor: "var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }}
          />
          <Area
            type="linear"
            dataKey="value"
            stroke="var(--foreground)"
            strokeWidth={2}
            fill="var(--primary)"
            fillOpacity={area ? 0.4 : 0}
            dot={{ r: 4, fill: "var(--primary)", stroke: "var(--foreground)", strokeWidth: 1.5 }}
            activeDot={{ r: 5, fill: "var(--primary)", stroke: "var(--foreground)", strokeWidth: 1.5 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </div>
    </div>
  );
}
