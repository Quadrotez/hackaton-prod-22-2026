"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  ActivityIcon,
  PillIcon,
  StethoscopeIcon,
  SyringeIcon,
  type LucideIcon,
} from "lucide-react";
import { useProtectedData } from "@/hooks/use-auth";
import { formatWeight, getPet, type Pet } from "@/lib/pets";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { PetInfoCard } from "@/components/pet-info-card";

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

function ChartPlaceholder({ title, hint }: { title: string; hint: string }) {
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <div
        role="img"
        aria-label={`${title}: данных пока нет`}
        className="flex h-40 items-center justify-center rounded-xl border border-dashed text-center text-sm text-muted-foreground"
      >
        {hint}
      </div>
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
  const load = useCallback(() => getPet(petId), [petId]);
  const state = useProtectedData(load, "Не удалось загрузить питомца");

  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") {
    return <PageError message={state.error} onRetry={state.retry} backToList />;
  }
  return <HealthContent pet={state.data} />;
}

function HealthContent({ pet }: { pet: Pet }) {
  const base = `/pet/${pet.id}/health`;

  return (
    <>
      <PageHeader title="Здоровье" backHref={`/pet/${pet.id}`} />

      <PetInfoCard pet={pet} />

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          accent
          label="Текущий вес"
          value={pet.weight_g != null ? formatWeight(pet.weight_g) : "—"}
          hint={pet.weight_g != null ? "по данным профиля" : "вес не указан"}
        />
        <StatTile label="Ближайший визит" value="—" hint="приёмов не запланировано" />
      </div>

      <ChartPlaceholder title="Динамика веса" hint="График появится после первых измерений" />

      <section aria-label="Разделы здоровья" className="grid grid-cols-2 gap-3">
        <QuickLinkTile
          href={`${base}/vaccines`}
          title="Прививки"
          description="Плановые и сделанные"
          icon={SyringeIcon}
          accent
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