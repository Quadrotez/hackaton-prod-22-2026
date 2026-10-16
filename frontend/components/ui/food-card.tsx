import type { FoodCardProps } from "@/lib/card";

const numberFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2,
});

function formatWeight(grams: number) {
  return grams >= 1000
    ? `${numberFormat.format(grams / 1000)} кг`
    : `${numberFormat.format(grams)} г`;
}

export default function FoodCard({ food }: FoodCardProps) {
  const remainingPercent = food.totalGrams > 0
    ? Math.min(100, Math.max(0, Math.round(food.remainingGrams / food.totalGrams * 100)))
    : 0;
  const stockDescription = `${formatWeight(food.remainingGrams)} из ${formatWeight(food.totalGrams)}`;
  const nutrients = [
    { label: "Белки", value: `${numberFormat.format(food.protein)} г` },
    { label: "Жиры", value: `${numberFormat.format(food.fats)} г` },
    { label: "Углев.", value: `${numberFormat.format(food.carbohydrates)} г` },
    { label: "Ккал", value: numberFormat.format(food.calories) },
  ];

  return (
    <article
      aria-labelledby={`food-${food.id}`}
      className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-border bg-white p-[18px]"
    >
      <div className="flex items-center gap-3.5">
        <div
          aria-hidden="true"
          className="flex size-[88px] shrink-0 items-center justify-center rounded-xl bg-secondary text-xs text-muted-foreground"
        >
          фото
        </div>
        <div className="min-w-0">
          <h2
            id={`food-${food.id}`}
            className="break-words font-sans text-lg font-semibold leading-[1.3] tracking-normal"
          >
            {food.name}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {food.description}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-4 gap-1.5 rounded-xl bg-background px-1.5 py-3 text-center">
        {nutrients.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-base font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex flex-col gap-1.5">
        <div className="flex flex-wrap justify-between gap-x-2 text-sm">
          <span>Осталось</span>
          <span className="font-semibold">{stockDescription}</span>
        </div>
        <div
          role="progressbar"
          aria-label={`Остаток корма: ${food.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={remainingPercent}
          aria-valuetext={stockDescription}
          className="h-2 overflow-hidden rounded-full bg-secondary"
        >
          <div
            className="h-full border-r-2 border-foreground bg-primary transition-[width] motion-reduce:transition-none"
            style={{ width: `${remainingPercent}%` }}
          />
        </div>
      </div>
    </article>
  );
}
