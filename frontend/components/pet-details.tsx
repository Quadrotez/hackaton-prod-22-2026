"use client";

import { useCallback } from "react";
import { CheckIcon, HeartPulseIcon, UtensilsIcon, type LucideIcon } from "lucide-react";
import { useProtectedData } from "@/hooks/use-auth";
import { listFeedingRecords, type FeedingRecord } from "@/lib/feeding";
import { formatWeight, getPet, pluralize } from "@/lib/pets";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { PetInfoCard } from "@/components/pet-info-card";

const RECENT_FEEDINGS_LIMIT = 3;

function isToday(date: Date): boolean {
  return date.toDateString() === new Date().toDateString();
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatFedAt(fedAt: string): string {
  const date = new Date(fedAt);
  const day = isToday(date)
    ? "сегодня"
    : date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return `${day}, ${formatTime(date)}`;
}

function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <Card variant={accent ? "accent" : "default"} className="flex flex-col gap-0.5">
      <p className={cn("text-sm", !accent && "text-muted-foreground")}>{label}</p>
      <p className="text-2xl font-semibold leading-tight tracking-tight tabular-nums">{value}</p>
      <p className={cn("text-xs", !accent && "text-muted-foreground")}>{hint}</p>
    </Card>
  );
}

function FeedingStatus({ record }: { record: FeedingRecord }) {
  if (!record.tolerated) return <span className="text-xs font-semibold text-destructive">плохо перенёс</span>;
  if (!record.liked) return <span className="text-xs font-semibold">не понравилось</span>;
  return <span className="text-xs text-muted-foreground">понравилось</span>;
}

function RecentFeedings({ records }: { records: FeedingRecord[] | null }) {
  return (
    <Card className="flex flex-col gap-2.5">
      <h2>Последние кормления</h2>
      {records === null ? (
        <p className="border-t border-secondary pt-2.5 text-sm text-muted-foreground">Не удалось загрузить историю кормлений</p>
      ) : records.length === 0 ? (
        <p className="border-t border-secondary pt-2.5 text-sm text-muted-foreground">Записей о кормлении пока нет</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {records.slice(0, RECENT_FEEDINGS_LIMIT).map((record) => (
            <li key={record.id} className="flex items-center gap-3 border-t border-secondary pt-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  record.liked && record.tolerated ? "bg-foreground text-primary" : "border-2 border-foreground bg-white",
                )}
              >
                {record.liked && record.tolerated && <CheckIcon className="size-3.5" strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{record.food_name}</p>
                <p className="text-xs text-muted-foreground">{formatFedAt(record.fed_at)}</p>
              </div>
              <FeedingStatus record={record} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function QuickLinkTile({
  title,
  description,
  icon: Icon,
  accent,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <Card
      aria-disabled="true"
      variant={accent ? "accent" : "default"}
      className="flex h-32 flex-col justify-between"
    >
      <div className="flex items-center justify-between">
        <h2>{title}</h2>
        <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col">
        <p className={cn("text-sm", !accent && "text-muted-foreground")}>{description}</p>
      </div>
    </Card>
  );
}

export function PetDetails({ petId }: { petId: number }) {
  const load = useCallback(
    () => Promise.all([getPet(petId), listFeedingRecords(petId).catch(() => null)]),
    [petId],
  );
  const state = useProtectedData(load, "Не удалось загрузить питомца");

  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") {
    return <PageError message={state.error} onRetry={state.retry} backToList />;
  }

  const [pet, feedings] = state.data;
  const fedToday = feedings?.filter((record) => isToday(new Date(record.fed_at))) ?? [];
  const lastFeeding = feedings?.[0];

  return (
    <>
      <PageHeader title={pet.name} backHref="/me" />

      <PetInfoCard pet={pet} onPetChange={(updated) => state.update([updated, feedings])} />

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          accent
          label="Ел сегодня"
          value={feedings ? `${fedToday.length} ${pluralize(fedToday.length, "раз", "раза", "раз")}` : "—"}
          hint={lastFeeding ? `последний раз ${formatFedAt(lastFeeding.fed_at)}` : "кормлений ещё не было"}
        />
        <StatTile
          label="Текущий вес"
          value={pet.weight_g != null ? formatWeight(pet.weight_g) : "—"}
          hint={pet.weight_g != null ? "по данным профиля" : "вес не указан"}
        />
      </div>

      <RecentFeedings records={feedings} />

      <section aria-label="Быстрые переходы" className="grid grid-cols-2 gap-3">
        <QuickLinkTile
          title="Здоровье"
          description="Вакцинации, визиты, заключения"
          icon={HeartPulseIcon}
        />
        <QuickLinkTile
          title="Питание"
          description="Последняя кормёжка и корма"
          icon={UtensilsIcon}
          accent
        />
      </section>
    </>
  );
}
