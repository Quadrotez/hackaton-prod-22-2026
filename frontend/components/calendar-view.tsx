"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRightIcon, StethoscopeIcon, SyringeIcon, PillIcon } from "lucide-react";
import DateChooser from "@/components/date-choose";
import { useProtectedData } from "@/hooks/use-auth";
import { loadCalendar } from "@/lib/health";
import { healthEventHref, toDateKey, type CalendarEvent } from "@/lib/health-events";
import { PageError, PageLoading } from "@/components/page-state";
import { cn } from "@/lib/utils";

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full" });
const eventStyles = {
  visit: { label: "Приём", icon: StethoscopeIcon, chip: "bg-primary text-primary-foreground" },
  vaccine: { label: "Прививка", icon: SyringeIcon, chip: "bg-sky-100 text-sky-900" },
  medicine: { label: "Лекарство", icon: PillIcon, chip: "bg-violet-100 text-violet-900" },
};

function EventLink({ event }: { event: CalendarEvent }) {
  const { icon: Icon, chip, label } = eventStyles[event.kind];
  return (
    <Link href={healthEventHref(event)} className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${chip}`}><Icon aria-hidden="true" className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold">{event.title}</p>
        <p className="text-xs text-muted-foreground">{event.petName} · {dateFormatter.format(new Date(`${event.date}T00:00:00`))}{event.time && ` · ${event.time}`}</p>
        <span className="text-xs text-muted-foreground">{event.completed ? "Выполнено" : label}</span>
      </div>
      <ArrowUpRightIcon aria-hidden="true" className="size-4 shrink-0" />
    </Link>
  );
}

export function CalendarView({ initialDate }: { initialDate: [number, number, number] }) {
  const router = useRouter();
  const [today] = useState(() => new Date(...initialDate));
  const todayKey = toDateKey(today);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const mondayOffset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset + index));
  const from = toDateKey(days[0]);
  const to = toDateKey(days[41]);
  const load = useCallback(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    return loadCalendar(
      toDateKey(new Date(month.getFullYear(), month.getMonth(), 1 - offset)),
      toDateKey(new Date(month.getFullYear(), month.getMonth(), 42 - offset)),
    );
  }, [month]);
  const state = useProtectedData(load, "Не удалось загрузить события календаря");
  const loading = state.status === "loading" || (state.status === "ready" && state.data.range !== `${from}/${to}`);
  const events = state.status === "ready" && !loading ? state.data.events : [];
  const selectedEvents = events.filter((event) => event.date === selectedDate);
  const nextEvents = events.filter((event) => event.date >= todayKey && !event.completed && event.date.slice(0, 7) === toDateKey(month).slice(0, 7)).slice(0, 5);

  return <>
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1>Календарь</h1><p className="mt-1 text-sm text-muted-foreground">Здоровье и планы всех питомцев</p></div>
      <DateChooser month={month} onMonthChange={(date) => { setMonth(date); setSelectedDate(toDateKey(date)); }} />
    </header>
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {Object.entries(eventStyles).map(([key, { label, icon: Icon }]) => <span key={key} className="flex items-center gap-1"><Icon aria-hidden="true" className="size-3.5" />{label}</span>)}
    </div>
    {state.status === "error" && <PageError message={state.error} onRetry={state.retry} />}
    <section aria-label="Сетка месяца" aria-busy={loading} className="min-w-0 rounded-2xl border bg-card p-2 sm:p-4">
      <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2" aria-hidden="true">
        {weekdays.map((day) => <span key={day} className="px-1 text-center text-xs text-muted-foreground sm:px-2 sm:text-left sm:text-sm">{day}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((date) => {
          const key = toDateKey(date);
          const dayEvents = events.filter((event) => event.date === key);
          return <button
            key={key} type="button" aria-label={`${dateFormatter.format(date)}${dayEvents.length ? `, событий: ${dayEvents.length}${dayEvents.length === 1 ? `, ${dayEvents[0].title}, ${dayEvents[0].petName}. Открыть здоровье` : ". Показать события"}` : ""}`}
            aria-current={key === todayKey ? "date" : undefined} aria-pressed={key === selectedDate}
            onClick={() => { setSelectedDate(key); if (dayEvents.length === 1) router.push(healthEventHref(dayEvents[0])); }}
            className={cn(
              "flex aspect-square min-w-0 flex-col gap-1 overflow-hidden rounded-lg border p-1 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground sm:rounded-xl sm:p-2 sm:text-base",
              date.getMonth() !== month.getMonth() ? "border-transparent text-muted-foreground" : "border-muted bg-card",
              key === todayKey && "border-2 border-foreground",
              key === selectedDate && "bg-background ring-1 ring-foreground/20",
            )}>
            <span className="leading-none">{date.getDate()}</span>
            {dayEvents[0] && <>
              <span className={`hidden w-full truncate rounded px-1 py-0.5 text-[10px] leading-tight sm:block ${eventStyles[dayEvents[0].kind].chip}`}>{dayEvents[0].title}</span>
              <span className="flex items-center gap-0.5 sm:hidden" aria-hidden="true">{dayEvents.slice(0, 3).map((event) => <span key={event.key} className={`size-1.5 rounded-full ${eventStyles[event.kind].chip}`} />)}</span>
              {dayEvents.length > 1 && <span className="text-[10px] leading-none text-muted-foreground">+{dayEvents.length - 1}</span>}
            </>}
          </button>;
        })}
      </div>
    </section>
    {loading ? <PageLoading /> : state.status === "ready" && <>
      <section aria-label="События выбранного дня" className="flex flex-col gap-3">
        <div><h2>{dateFormatter.format(new Date(`${selectedDate}T00:00:00`))}</h2><p className="mt-1 text-sm text-muted-foreground">Нажмите событие, чтобы открыть запись в здоровье питомца.</p></div>
        {selectedEvents.length ? selectedEvents.map((event) => <EventLink key={event.key} event={event} />) : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">На этот день событий нет. Запланируйте приём или прививку в разделе «Здоровье» питомца.</p>}
      </section>
      {nextEvents.length > 0 && <section aria-label="Ближайшие события" className="flex flex-col gap-3"><h2>Ближайшие в этом месяце</h2>{nextEvents.map((event) => <EventLink key={event.key} event={event} />)}</section>}
      {!state.data.pets.length && <Link href="/pet/create" className="text-sm underline underline-offset-4">Добавить первого питомца</Link>}
    </>}
  </>;
}
