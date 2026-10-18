"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ArrowRightIcon } from "lucide-react";
import { CalendarGrid, kindColor, monthGrid, type DayMarker } from "@/components/calendar-view";
import { useActivePet } from "@/components/active-pet-provider";
import { PetAvatar } from "@/components/pet-avatar";
import { PageError } from "@/components/page-state";
import { useTransferData } from "@/hooks/use-transfer-data";
import { useNow } from "@/hooks/use-now";
import { loadCalendar } from "@/lib/health";
import { healthEventHref, toDateKey, type CalendarEvent } from "@/lib/health-events";
import { cn } from "@/lib/utils";
import { isCaretaker, pluralize, type Pet } from "@/lib/pets";
import { currentTransfer, isOpenTransfer, listIncomingTransfers, listOutgoingTransfers, listReceivedTransfers } from "@/lib/transfers";
import { Card } from "@/components/ui/card";
import { QuickAddMenu } from "@/components/quick-add-menu";

const EMPTY_EVENTS: CalendarEvent[] = [];

const longDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" });
const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const fromKey = (key: string) => new Date(`${key}T00:00:00`);

const kindLabels: Record<CalendarEvent["kind"], string> = {
  visit: "Приём",
  vaccine: "Прививка",
  medicine: "Лекарство",
  parasite: "Обработка",
  birthday: "День рождения",
};

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
  const { activePet } = useActivePet();
  const [today] = useState(() => new Date());
  const todayKey = toDateKey(today);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(todayKey);

  const loadTransfers = useCallback(() => Promise.all([listIncomingTransfers(), listOutgoingTransfers(), listReceivedTransfers()]), []);
  const transfers = useTransferData(loadTransfers, "Не удалось загрузить передачи");
  const now = useNow(1_000);
  const transferLists = transfers.status === "ready" ? transfers.data.map((items) => items.map((item) => currentTransfer(item, now)).filter(isOpenTransfer)) : null;
  const answersNeeded =
    transferLists
      ? transferLists[0].length +
        transferLists[1].filter((transfer) => transfer.status === "return_requested").length
      : 0;
  const hasTransfers = transferLists?.some((items) => items.length > 0) ?? false;

  const days = useMemo(() => monthGrid(month), [month]);
  const from = toDateKey(days[0]);
  const to = toDateKey(days[41]);
  const activePetId = activePet?.id;
  const load = useCallback(() => loadCalendar(from, to, activePetId), [from, to, activePetId]);
  const calendar = useTransferData(load, "Не удалось загрузить события календаря");
  const loading =
    calendar.status === "loading" || (calendar.status === "ready" && (calendar.data.range !== `${from}/${to}` || calendar.data.petId !== (activePetId ?? null)));
  const loadedEvents = calendar.status === "ready" ? calendar.data.events : undefined;
  const events = useMemo(
    () => (loadedEvents && !loading ? loadedEvents.filter((event) => event.petId === activePet?.id) : EMPTY_EVENTS),
    [loadedEvents, loading, activePet?.id],
  );

  const petsById = useMemo(() => new Map(pets.map((pet) => [pet.id, pet])), [pets]);

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
    <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-8">
      {hasTransfers && (
        <Link
          href="/transfers"
          className="rounded-2xl outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-foreground"
        >
          <Card variant="accent" className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <h2>Передачи</h2>
              <p className="text-sm">
                {answersNeeded > 0 ? `${answersNeeded} ${pluralize(answersNeeded, "заявка ждёт", "заявки ждут", "заявок ждут")} вашего ответа` : "Посмотреть питомцев на передержке и мои заявки"}
              </p>
            </div>
            <ArrowRightIcon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.5} />
          </Card>
        </Link>
      )}

      {activePet && <div className="flex items-center gap-3">
        <PetAvatar pet={activePet} size="xs" />
        <div className="min-w-0"><h2 className="truncate">Календарь: {activePet.name}</h2><p className="text-xs text-muted-foreground">{isCaretaker(activePet) ? "Под присмотром · события этого питомца" : "Мой питомец"}</p></div>
      </div>}
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
        action={<QuickAddMenu pets={activePet ? [activePet] : []} />}
      />

      {calendar.status === "error" && <PageError message={calendar.error} onRetry={calendar.retry} />}
      {calendar.status === "ready" && calendar.refreshError && <PageError message={calendar.refreshError} onRetry={calendar.refresh} />}

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
              <EventRow key={event.key} event={event} pet={petsById.get(event.petId)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
