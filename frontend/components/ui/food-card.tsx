import { CookieIcon, SoupIcon, WheatIcon } from "lucide-react";
import { cardVariants } from "@/components/ui/card";
import type { FoodCardProps } from "@/lib/card";
import { getDaysLeft, isLowStock } from "@/lib/foods";
import { pluralize } from "@/lib/pets";
import { cn } from "@/lib/utils";

const numberFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2,
});

const foodIcons = {
  dry: WheatIcon,
  wet: SoupIcon,
  treat: CookieIcon,
};

function formatWeight(grams: number) {
  return grams >= 1000
    ? `${numberFormat.format(grams / 1000)} кг`
    : `${numberFormat.format(grams)} г`;
}

export default function FoodCard({ food, children }: FoodCardProps & { children?: React.ReactNode }) {
  const Icon = foodIcons[food.type];
  const remainingPercent = food.total_grams > 0
    ? Math.min(100, Math.max(0, Math.round(food.remaining_grams / food.total_grams * 100)))
    : 0;
  const stockDescription = `${formatWeight(food.remaining_grams)} из ${formatWeight(food.total_grams)}`;
  const daysLeft = getDaysLeft(food);
  const lowStock = isLowStock(food);
  const forecast = food.remaining_grams <= 0
    ? "Закончился"
    : daysLeft === null
      ? "Расход пока не известен"
      : daysLeft === 0
        ? "Закончится сегодня"
        : `Хватит примерно на ${daysLeft} ${pluralize(daysLeft, "день", "дня", "дней")}`;
  const nutrients = [
    { label: "Белки", value: `${numberFormat.format(food.protein)} г` },
    { label: "Жиры", value: `${numberFormat.format(food.fats)} г` },
    { label: "Углев.", value: `${numberFormat.format(food.carbohydrates)} г` },
    { label: "Ккал", value: numberFormat.format(food.calories) },
  ];

  return (
    <article
      aria-labelledby={`food-${food.id}`}
      className={cn(cardVariants(), "flex min-w-0 flex-col gap-4 text-foreground")}
    >
      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary"
        >
          <Icon className="size-5" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <h2
            id={`food-${food.id}`}
            className="break-words font-sans text-[clamp(1.0625rem,1rem+0.3vw,1.25rem)] font-[650] leading-[1.3] tracking-[-0.015em]"
          >
            {food.name}
          </h2>
          {food.description && (
            <p className="mt-0.5 text-sm leading-[1.55] text-muted-foreground">
              {food.description}
            </p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-4 gap-1.5 rounded-xl bg-background px-1.5 py-3 text-center">
        {nutrients.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-base font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
          <span className="text-muted-foreground">Осталось</span>
          <span className="font-semibold tabular-nums">{stockDescription}</span>
        </div>
        <div
          role="progressbar"
          aria-label={`Остаток корма: ${food.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={remainingPercent}
          aria-valuetext={stockDescription}
          className="h-1.5 overflow-hidden rounded-full bg-secondary"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
            style={{ width: `${remainingPercent}%` }}
          />
        </div>
        <p className={cn("text-xs", lowStock ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {forecast}
        </p>
      </div>

      {children && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">{children}</div>
      )}
    </article>
  );
}
