"use client";

import { useCallback } from "react";
import Link from "next/link";
import { ArrowRightIcon, type LucideIcon } from "lucide-react";
import { useProtectedData } from "@/hooks/use-auth";
import { useNow } from "@/hooks/use-now";
import { listFoods } from "@/lib/foods";
import { formatTimeAgo, listMeals, sortMeals, type Meal } from "@/lib/meals";
import { formatWeight, getPet, isCaretaker, pluralize } from "@/lib/pets";
import { formatTransferDate } from "@/lib/transfers";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { PetInfoCard } from "@/components/pet-info-card";
import { PetMeals } from "@/components/pet-meals";
import { Button } from "./ui/button";

function isToday(date: Date): boolean {
  return date.toDateString() === new Date().toDateString();
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

function QuickLinkTile({
  title,
  description,
  icon: Icon,
  accent,
  href,
}: {
  href?: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  const content = (
    <Card
      aria-disabled={href ? undefined : true}
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
  return href ? <Link href={href} className="rounded-2xl outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-foreground">{content}</Link> : content;
}

function CareNotice({ ownerName, endsAt }: { ownerName?: string | null; endsAt?: string | null }) {
  return (
    <Card variant="accent" className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1">
        <h3>Питомец у вас на время</h3>
        {(ownerName || endsAt) && (
          <p className="text-sm font-medium leading-5">
            {[ownerName && `Владелец: ${ownerName}`, endsAt && `до ${formatTransferDate(endsAt)}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <p className="text-sm leading-5">
          Можно кормить, отмечать лекарства и добавлять симптомы, замеры и визиты, но не менять и не удалять данные.
        </p>
      </div>
      <Link href="/transfers"><Button variant="secondary">Вернуть владельцу</Button></Link>
    </Card>
  );
}

export function PetDetails({ petId, startFeeding = false }: { petId: number; startFeeding?: boolean }) {
  const load = useCallback(
    () => Promise.all([
      getPet(petId),
      listMeals(petId).then(sortMeals).catch(() => null),
      // The owner's catalog: for a temporary caretaker it is not their own.
      listFoods(petId).catch(() => null),
    ]),
    [petId],
  );
  const state = useProtectedData(load, "Не удалось загрузить питомца");
  const now = useNow();

  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") {
    return <PageError message={state.error} onRetry={state.retry} backToList />;
  }

  const [pet, meals, foods] = state.data;
  const { update } = state;
  const fedToday = meals?.filter((meal) => isToday(new Date(meal.fed_at))) ?? [];
  const lastMeal = meals?.[0];
  const caretaker = isCaretaker(pet);

  async function handleMealsChange(next: Meal[]) {
    const sorted = sortMeals(next);
    update([pet, sorted, foods]);
    const refreshed = await listFoods(petId).catch(() => null);
    if (refreshed) update([pet, sorted, refreshed]);
  }

  return (
    <>
      <PageHeader title={pet.name} backHref="/me" />

      <PetInfoCard pet={pet} onPetChange={(updated) => state.update([updated, meals, foods])} />

      {caretaker && <CareNotice ownerName={pet.owner_name} endsAt={pet.care_ends_at} />}

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          accent
          label="Ел сегодня"
          value={meals ? `${fedToday.length} ${pluralize(fedToday.length, "раз", "раза", "раз")}` : "—"}
          hint={lastMeal ? `покормили ${formatTimeAgo(lastMeal.fed_at, now)}` : "кормлений ещё не было"}
        />
        <StatTile
          label="Текущий вес"
          value={pet.weight_g != null ? formatWeight(pet.weight_g) : "—"}
          hint={pet.weight_g != null ? "по данным профиля" : "вес не указан"}
        />
      </div>

      <PetMeals key={pet.id} defaultOpen={startFeeding} petId={pet.id} meals={meals} foods={foods} now={now} onMealsChange={handleMealsChange} caretaker={caretaker} />

      <section aria-label="Быстрые переходы" className="grid md:grid-cols-2 gap-3">
        <QuickLinkTile
          href={`/pet/${petId}/health`}
          title="Здоровье"
          description="Вакцинации, визиты, заключения"
          icon={ArrowRightIcon}
        />
        <QuickLinkTile
          href={`/pet/${petId}/measurements`}
          title="Измерения"
          description="Отслеживайте параметры вашего питомца"
          icon={ArrowRightIcon}
        />
      </section>

      {!caretaker && <Card>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h3>Передача другому человеку</h3>
            <h5 className="leading-5 text-muted-foreground">
              Если кто-то будет присматривать за питомцем во время отъезда, отправьте ему заявку на передачу.
            </h5>
          </div>
          <Link href={`/pet/${petId}/transfer`}><Button>Передать</Button></Link>
        </div>
      </Card>}
    </>
  );
}
