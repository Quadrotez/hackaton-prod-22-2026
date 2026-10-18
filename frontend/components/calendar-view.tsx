"use client";

import DateChooser from "@/components/date-choose";
import { toDateKey, type CalendarEvent } from "@/lib/health-events";
import { cn } from "@/lib/utils";

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full" });

export type EventKind = CalendarEvent["kind"];

export const kindColor: Record<EventKind, string> = {
  visit: "bg-emerald-600",
  vaccine: "bg-sky-500",
  medicine: "bg-violet-500",
  parasite: "bg-amber-500",
};

export type DayMarker = {
  total: number;
  kinds: { kind: EventKind; pending: boolean }[];
};

export function monthGrid(month: Date) {
  const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - offset + i));
}

type CalendarGridProps = {
  days: Date[];
  month: Date;
  onMonthChange: (month: Date) => void;
  todayKey: string;
  selectedKey: string;
  onSelectKey: (key: string) => void;
  markers: Map<string, DayMarker>;
  busy?: boolean;
};

export function CalendarGrid({
  days,
  month,
  onMonthChange,
  todayKey,
  selectedKey,
  onSelectKey,
  markers,
  busy,
}: CalendarGridProps) {
  return (
    <section aria-label="Календарь" aria-busy={busy} className="flex min-w-0 flex-col gap-4">
      <DateChooser month={month} onMonthChange={onMonthChange} />
      <div className="min-w-0 rounded-2xl border bg-card p-2 sm:p-4">
        <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2" aria-hidden="true">
          {weekdays.map((day) => (
            <span key={day} className="px-1 text-center text-xs text-muted-foreground sm:px-2 sm:text-left sm:text-sm">
              {day}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {days.map((date) => {
            const key = toDateKey(date);
            const marker = markers.get(key);
            const outside = date.getMonth() !== month.getMonth();
            return (
              <button
                key={key}
                type="button"
                aria-label={marker ? `${dateFormatter.format(date)}, событий: ${marker.total}` : dateFormatter.format(date)}
                aria-current={key === todayKey ? "date" : undefined}
                aria-pressed={key === selectedKey}
                onClick={() => onSelectKey(key)}
                className={cn(
                  "relative aspect-[1/1.05] min-w-0 rounded-lg border p-1 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground sm:aspect-square sm:rounded-xl sm:p-2.5 sm:text-base",
                  outside ? "border-transparent text-muted-foreground" : "border-muted bg-card",
                  key === todayKey && "border-2 border-foreground",
                  key === selectedKey && "bg-primary hover:bg-primary/80",
                )}
              >
                <span className="flex h-full items-start">{date.getDate()}</span>
                {marker && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5"
                  >
                    {marker.kinds.map(({ kind, pending }) => (
                      <span
                        key={kind}
                        className={cn("size-1 rounded-full sm:size-1.5", kindColor[kind], !pending && "opacity-40")}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
