"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { cardVariants } from "@/components/ui/card";
import { CalendarView, dateKey, type DayMarker } from "@/components/calendar-view";
import { cn } from "@/lib/utils";
import type { Pet } from "@/lib/pets";
import type { PetEvent } from "@/lib/events";

const longDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" });
const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

// ПРОВЕРЬТЕ маршрут события
const eventHref = (e: PetEvent) => `/pet/${e.petId}/event/${e.id}`;

function EventItem({ event, pet, showDate }: { event: PetEvent; pet?: Pet; showDate?: boolean }) {
  return (
    <li className={cn(cardVariants(), "flex items-center gap-3 p-3 transition-colors hover:bg-card/70")}>
      <Link
        href={eventHref(event)}
        className="flex min-w-0 flex-1 flex-col gap-0.5 outline-none focus-visible:underline"
      >
        <span className={cn("truncate", event.done && "text-muted-foreground line-through")}>{event.title}</span>
        <span className="truncate text-sm text-muted-foreground">
          {showDate && `${shortDate.format(new Date(event.date))} · `}
          {pet?.name ?? "Питомец"}
        </span>
      </Link>
      {pet && (
        <Link
          href={`/pet/${pet.id}`}
          className="shrink-0 rounded-full border px-3 py-1 text-sm outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-foreground"
        >
          {pet.name}
        </Link>
      )}
    </li>
  );
}

export function HomeDashboard({ pets, events }: { pets: Pet[]; events: PetEvent[] }) {
  const [today] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(today);

  const petsById = useMemo(() => new Map(pets.map((p) => [p.id, p])), [pets]);

  const { eventsByDay, markers } = useMemo(() => {
    const byDay = new Map<string, PetEvent[]>();
    const marks = new Map<string, DayMarker>();
    for (const event of events) {
      const key = dateKey(new Date(event.date));
      byDay.set(key, [...(byDay.get(key) ?? []), event]);
      const prev = marks.get(key) ?? { total: 0, pending: 0 };
      marks.set(key, { total: prev.total + 1, pending: prev.pending + (event.done ? 0 : 1) });
    }
    return { eventsByDay: byDay, markers: marks };
  }, [events]);

  // просроченные и сегодняшние невыполненные
  const attention = useMemo(() => {
    const todayKey = dateKey(today);
    return events
      .filter((e) => !e.done && dateKey(new Date(e.date)) <= todayKey)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events, today]);

  const dayEvents = eventsByDay.get(dateKey(selectedDate)) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <aside className="order-first flex min-w-0 flex-col gap-6 lg:order-last">
        <section aria-labelledby="attention-title" className="flex flex-col gap-3">
          <h2 id="attention-title">Требует внимания</h2>
          {attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">Всё в порядке — просроченных дел нет.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {attention.slice(0, 5).map((event) => (
                <EventItem key={event.id} event={event} pet={petsById.get(event.petId)} showDate />
              ))}
            </ul>
          )}
          {attention.length > 5 && (
            <p className="text-sm text-muted-foreground">И ещё {attention.length - 5}…</p>
          )}
        </section>

        <section aria-labelledby="pets-title" className="flex flex-col gap-3">
          <h2 id="pets-title">Питомцы</h2>
          <ul
            aria-label="Мои питомцы"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
          >
            {pets.map((pet) => (
              <li key={pet.id} className="shrink-0 lg:shrink">
                <Link
                  href={`/pet/${pet.id}`}
                  className={cn(
                    cardVariants(),
                    "flex items-center gap-3 p-3 outline-none transition-colors hover:bg-card/70 focus-visible:ring-2 focus-visible:ring-foreground",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary"
                  >
                    {pet.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{pet.name}</span>
                  <ChevronRightIcon aria-hidden="true" className="hidden size-5 shrink-0 text-muted-foreground lg:block" />
                </Link>
              </li>
            ))}
            <li className="shrink-0 lg:shrink">
              <Link
                href="/pet/create"
                className={cn(
                  cardVariants(),
                  "flex items-center gap-3 p-3 outline-none transition-colors hover:bg-card/70 focus-visible:ring-2 focus-visible:ring-foreground",
                )}
              >
                <PlusIcon aria-hidden="true" className="size-5" />
                <span>Добавить</span>
              </Link>
            </li>
          </ul>
        </section>
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        <CalendarView
          today={today}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          markers={markers}
        />
        <section aria-labelledby="day-title" className="flex flex-col gap-3">
          <h2 id="day-title" className="capitalize">{longDate.format(selectedDate)}</h2>
          {dayEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">На этот день событий нет.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dayEvents.map((event) => (
                <EventItem key={event.id} event={event} pet={petsById.get(event.petId)} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}