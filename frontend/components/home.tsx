"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";
import { CalendarGrid, kindColor, monthGrid, type DayMarker } from "@/components/calendar-view";
import { PetAvatar } from "@/components/pet-avatar";
import { PageError } from "@/components/page-state";
import { useProtectedData } from "@/hooks/use-auth";
import { loadCalendar } from "@/lib/health";
import { healthEventHref, toDateKey, type CalendarEvent } from "@/lib/health-events";
import { cn } from "@/lib/utils";
import type { Pet } from "@/lib/pets";

const longDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" });
const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const fromKey = (key: string) => new Date(`${key}T00:00:00`);

const kindLabels: Record<CalendarEvent["kind"], string> = {
  visit: "Приём",
  vaccine: "Прививка",
  medicine: "Лекарство",
};

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id}>{children}</h2>;
}

function EventRow({ event, pet, showDate }: { event: CalendarEvent; pet?: Pet; showDate?: boolean }) {
  return (
    <li className="flex items-start gap-3 py-2 last:pb-0">
      <span
        aria-hidden="true"
        className={cn("w-1 self-stretch rounded-full", kindColor[event.kind])}
      />
      {pet && <PetAvatar pet={pet} size="xs" />}
      <Link
        href={healthEventHref(event)}
        className="flex min-w-0 flex-1 flex-col outline-none focus-visible:underline"
      >
        <span className={cn("truncate", event.completed && "text-muted-foreground line-through")}>
          {event.title}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {showDate && `${shortDate.format(fromKey(event.date))} · `}
          {kindLabels[event.kind]}
          {event.time && ` · ${event.time}`}
        </span>
      </Link>
      {pet && (
        <Link
          href={`/pet/${pet.id}`}
          className="shrink-0 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:underline"
        >
          {pet.name}
        </Link>
      )}
    </li>
  );
}

export function HomeDashboard({ pets }: { pets: Pet[] }) {
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

  const pastFrom = toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30));
  const loadPast = useCallback(() => loadCalendar(pastFrom, todayKey), [pastFrom, todayKey]);
  const past = useProtectedData(loadPast, "Не удалось загрузить события");
  const attention =
    past.status === "ready"
      ? past.data.events
          .filter((e) => !e.completed && e.date <= todayKey)
          .sort((a, b) => a.date.localeCompare(b.date))
      : [];

  const petsByName = useMemo(() => new Map(pets.map((p) => [p.name, p])), [pets]);

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

  const dayEvents = events.filter((e) => e.date === selectedKey);

  return (
    <div className="flex max-w-md flex-col gap-8">
      <section aria-labelledby="pets-title" className="flex flex-col gap-3">
        <SectionTitle id="pets-title">Питомцы</SectionTitle>
        <ul
          aria-labelledby="pets-title"
          className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {pets.map((pet) => (
            <li key={pet.id} className="shrink-0">
              <Link
                href={`/pet/${pet.id}`}
                className="group flex w-20 flex-col items-center gap-1.5 outline-none"
              >
                <PetAvatar
                  pet={pet}
                  size="md"
                  className="bg-white group-focus-visible:ring-2 group-focus-visible:ring-foreground group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background"
                />
                <span className="w-full truncate text-center text-sm font-medium text-foreground">{pet.name}</span>
              </Link>
            </li>
          ))}
          <li className="shrink-0">
            <Link
              href="/pet/create"
              className="group flex w-20 flex-col items-center gap-1.5 outline-none"
            >
              <span className="flex size-16 items-center justify-center rounded-full border border-dashed border-zinc-600 text-zinc-600 transition group-hover:border-foreground group-hover:text-foreground group-focus-visible:border-solid group-focus-visible:border-foreground group-focus-visible:text-foreground group-focus-visible:ring-2 group-focus-visible:ring-foreground group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background group-active:scale-95 motion-reduce:transition-none motion-reduce:group-active:scale-100">
                <PlusIcon aria-hidden="true" className="size-6" />
              </span>
              <span className="w-full truncate text-center text-sm text-zinc-600 transition-colors group-hover:text-foreground group-focus-visible:text-foreground">
                Добавить
              </span>
            </Link>
          </li>
        </ul>
      </section>

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

      {calendar.status === "error" && <PageError message={calendar.error} onRetry={calendar.retry} />}

      <section
        aria-labelledby="day-title"
        className="flex flex-col gap-1 rounded-2xl border bg-card p-4"
      >
        <h2 id="day-title" className="capitalize">{longDate.format(fromKey(selectedKey))}</h2>
        {dayEvents.length === 0 ? (
          <p className="pt-2 text-sm text-muted-foreground">
            {loading ? "Загрузка…" : selectedKey === todayKey ? "Сегодня событий нет" : "Событий нет"}
          </p>
        ) : (
          <ul className="flex flex-col mt-2">
            {dayEvents.map((event) => (
              <EventRow key={event.key} event={event} pet={petsByName.get(event.petName)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}