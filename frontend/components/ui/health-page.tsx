"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  ActivityIcon,
  BugIcon,
  PillIcon,
  StethoscopeIcon,
  SyringeIcon,
  type LucideIcon,
} from "lucide-react";
import { useProtectedData } from "@/hooks/use-auth";
import { formatWeight, type Pet } from "@/lib/pets";
import { loadHealthDashboard, type HealthOverview } from "@/lib/health-sections";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { PetWeightChart } from "@/components/pet-weight-chart";
import { PetCard } from "../pet-card";

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
  href,
  accent,
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
      <p className={cn("text-sm", !accent && "text-muted-foreground")}>{description}</p>
    </Card>
  );
  return href ? (
    <Link
      href={href}
      className="rounded-2xl outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-foreground"
    >
      {content}
    </Link>
  ) : (
    content
  );
}

export function HealthPage({ petId }: { petId: number }) {
  const load = useCallback(() => loadHealthDashboard(petId), [petId]);
  const state = useProtectedData(load, "Не удалось загрузить питомца");

  if (state.status === "loading" || (state.status === "ready" && state.data.pet.id !== petId)) return <PageLoading />;
  if (state.status === "error") {
    return <PageError message={state.error} onRetry={state.retry} backToList />;
  }
  return <HealthContent pet={state.data.pet} overview={state.data.overview} />;
}

const shortDate = (value: string) => new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

function HealthContent({ pet, overview }: { pet: Pet; overview: HealthOverview }) {
  const base = `/pet/${pet.id}/health`;
  const nextVisit = overview.planned_visits[0];
  const nextVaccination = overview.next_vaccination?.next_due_on ?? overview.next_vaccination?.scheduled_on;

  return (
    <>
      <PageHeader title="Здоровье" backHref={`/pet/${pet.id}`} />

      <PetCard pet={pet} />

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          accent
          label="Текущий вес"
          value={pet.weight_g != null ? formatWeight(pet.weight_g) : "—"}
          hint={pet.weight_g != null ? "по данным профиля" : "вес не указан"}
        />
        <StatTile label="Ближайший визит" value={nextVisit ? new Date(nextVisit.visit_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "—"} hint={nextVisit ? nextVisit.title : "приёмов не запланировано"} />
        <StatTile label="Следующая прививка" value={nextVaccination ? shortDate(nextVaccination) : "—"} hint={overview.next_vaccination?.name ?? "прививок по плану нет"} />
        <StatTile label="Следующая обработка" value={overview.next_parasite?.next_due_on ? shortDate(overview.next_parasite.next_due_on) : "—"} hint={overview.next_parasite?.product_name ?? "обработок по плану нет"} />
      </div>

      
      <PetWeightChart key={`${pet.id}-${pet.weight_g}`} petId={pet.id} />

      <section aria-label="Разделы здоровья" className="grid grid-cols-2 gap-3">
        <QuickLinkTile
          href={`${base}/vaccines`}
          title="Прививки"
          description="Плановые и сделанные"
          icon={SyringeIcon}
          accent
        />
        <QuickLinkTile
          href={`${base}/parasites`}
          title="Обработки"
          description="От блох, клещей и глистов"
          icon={BugIcon}
        />
        <QuickLinkTile
          href={`${base}/visits`}
          title="Приёмы"
          description="Визиты к врачу и причины"
          icon={StethoscopeIcon}
        />
        <QuickLinkTile
          href={`${base}/medicines`}
          title="Лекарства"
          description="Курсы и дозировки"
          icon={PillIcon}
        />
        <QuickLinkTile
          href={`${base}/symptoms`}
          title="Симптомы"
          description="Наблюдения и аллергии"
          icon={ActivityIcon}
          accent
        />
      </section>
    </>
  );
}
