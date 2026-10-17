"use client";

import { useState } from "react";
import DateChooser from "@/components/date-choose";
import { cn } from "@/lib/utils";

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full" });

export function isSameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

export function dateKey(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

export type DayMarker = { total: number; pending: number };

type CalendarViewProps = {
  today: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  /** ключ — dateKey(date) */
  markers: Map<string, DayMarker>;
};

export function CalendarView({ today, selectedDate, onSelectDate, markers }: CalendarViewProps) {
  const [month, setMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, index) => (
    new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset + index)
  ));

  return (
    <section aria-label="Календарь" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h2>Календарь</h2>
        <DateChooser month={month} onMonthChange={setMonth} />
      </header>
      <div className="min-w-0 rounded-2xl border bg-card p-2 sm:p-4">
        <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2" aria-hidden="true">
          {weekdays.map((day) => (
            <span key={day} className="px-1 text-center text-xs text-muted-foreground sm:px-2 sm:text-left sm:text-sm">{day}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {days.map((date) => {
            const isToday = isSameDay(date, today);
            const selected = isSameDay(date, selectedDate);
            const outsideMonth = date.getMonth() !== month.getMonth();
            const marker = markers.get(dateKey(date));
            const label = marker
              ? `${dateFormatter.format(date)}, событий: ${marker.total}`
              : dateFormatter.format(date);
            return (
              <button
                key={date.getTime()}
                type="button"
                aria-label={label}
                aria-current={isToday ? "date" : undefined}
                aria-pressed={selected}
                onClick={() => {
                  onSelectDate(date);
                  if (outsideMonth) setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                }}
                className={cn(
                  "relative aspect-square min-w-0 rounded-lg border p-1 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground sm:rounded-xl sm:p-2.5 sm:text-base",
                  outsideMonth ? "border-transparent text-muted-foreground" : "border-muted bg-card",
                  isToday && "border-2 border-foreground",
                  selected && "bg-primary hover:bg-primary/80",
                )}
              >
                <span className="flex h-full items-start">{date.getDate()}</span>
                {marker && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute bottom-1.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full sm:size-2",
                      marker.pending > 0 ? "bg-foreground" : "bg-muted-foreground/40",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p role="status" className="sr-only">
        {`Выбрано: ${dateFormatter.format(selectedDate)}`}
      </p>
    </section>
  );
}