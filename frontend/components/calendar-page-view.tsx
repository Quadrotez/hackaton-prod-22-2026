"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ArrowUpRightIcon, PillIcon, StethoscopeIcon, SyringeIcon } from "lucide-react";
import { CalendarGrid, kindColor, monthGrid, type DayMarker } from "@/components/calendar-view";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";
import { useProtectedData } from "@/hooks/use-auth";
import { loadCalendar } from "@/lib/health";
import { healthEventHref, toDateKey, type CalendarEvent } from "@/lib/health-events";
import { cn } from "@/lib/utils";

const eventStyles = {
  visit: { label: "Приём", icon: StethoscopeIcon },
  vaccine: { label: "Прививка", icon: SyringeIcon },
  medicine: { label: "Лекарство", icon: PillIcon },
} as const;

const dayFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full" });

function EventLink({ event }: { event: CalendarEvent }) {
  const { icon: Icon, label } = eventStyles[event.kind];
  return (
    <Link
      href={healthEventHref(event)}
      className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-white", kindColor[event.kind])}>
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("break-words text-sm font-semibold", event.completed && "text-muted-foreground line-through")}>
          {event.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {event.petName}
          {event.time && ` · ${event.time}`}
        </p>
        <span className="text-xs text-muted-foreground">{event.completed ? "Выполнено" : label}</span>
      </div>
      <ArrowUpRightIcon aria-hidden="true" className="size-4 shrink-0" />
    </Link>
  );
}

export function CalendarPageView() {
  const [today] = useState(() => new Date());
  const todayKey = toDateKey(today);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(todayKey);

  const days = useMemo(() => monthGrid(month), [month]);
  const from = toDateKey(days[0]);
  const to = toDateKey(days[41]);
  const load = useCallback(() => loadCalendar(from, to), [from, to]);
  const calendar = useProtectedData(load, "Не удалось загрузить события календаря");
  const loading =
    calendar.status === "loading" || (calendar.status === "ready" && calendar.data.range !== `${from}/${to}`);
  const events = calendar.status === "ready" && !loading ? calendar.data.events : [];

  const markers = useMemo(() => {
    const marks = new Map<string, DayMarker>();
    for (const event of events) {
      const marker = marks.get(event.date) ?? { total: 0, kinds: [] };
      marker.total += 1;
      const existing = marker.kinds.find((k) => k.kind === event.kind);
      if (existing) existing.pending ||= !event.completed;
      else marker.kinds.push({ kind: event.kind, pending: !event.completed });
      marks.set(event.date, marker);
    }
    return marks;
  }, [events]);

  const dayEvents = events.filter((event) => event.date === selectedKey);
  const nextEvents = events
    .filter((event) => event.date >= todayKey && !event.completed && event.date.slice(0, 7) === toDateKey(month).slice(0, 7))
    .slice(0, 5);

  return (
    <PageShell contentClassName="max-w-md">
      <PageHeader title="Календарь" description="Здоровье и планы всех питомцев" />

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries(eventStyles).map(([kind, { label, icon: Icon }]) => (
          <span key={kind} className="flex items-center gap-1">
            <Icon aria-hidden="true" className="size-3.5" />
            {label}
          </span>
        ))}
      </div>

      {calendar.status === "error" && <PageError message={calendar.error} onRetry={calendar.retry} />}

      <CalendarGrid
        days={days}
        month={month}
        onMonthChange={(date) => {
          setMonth(date);
          setSelectedKey(toDateKey(date));
        }}
        todayKey={todayKey}
        selectedKey={selectedKey}
        onSelectKey={setSelectedKey}
        markers={markers}
        busy={loading}
      />

      {loading ? (
        <PageLoading />
      ) : (
        calendar.status === "ready" && (
          <>
            <section aria-label="События выбранного дня" className="flex flex-col gap-3">
              <h2 className="capitalize">{dayFormatter.format(new Date(`${selectedKey}T00:00:00`))}</h2>
              {dayEvents.length ? (
                dayEvents.map((event) => <EventLink key={event.key} event={event} />)
              ) : (
                <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  На этот день событий нет. Запланируйте приём или прививку в разделе «Здоровье» питомца.
                </p>
              )}
            </section>

            {nextEvents.length > 0 && (
              <section aria-label="Ближайшие события" className="flex flex-col gap-3">
                <h2>Ближайшие в этом месяце</h2>
                {nextEvents.map((event) => (
                  <EventLink key={event.key} event={event} />
                ))}
              </section>
            )}
          </>
        )
      )}
    </PageShell>
  );
}
