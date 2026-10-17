"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  month: Date;
  onMonthChange: (month: Date) => void;
}

const monthFormatter = new Intl.DateTimeFormat("ru-RU", { month: "long" });

export default function DateChooser({ month, onMonthChange }: Props) {
  const monthName = monthFormatter.format(month);
  const label = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${month.getFullYear()}`;

  function changeMonth(offset: number) {
    const nextMonth = new Date(month);
    nextMonth.setDate(1);
    nextMonth.setMonth(nextMonth.getMonth() + offset);
    onMonthChange(nextMonth);
  }

  return (
    <div role="group" aria-label="Выбор месяца" className="flex items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-10 theme-shadcn rounded-xl"
        aria-label="Предыдущий месяц"
        onClick={() => changeMonth(-1)}
      >
        <ArrowLeft aria-hidden="true" />
      </Button>
      <span aria-live="polite" aria-atomic="true" className="min-w-37.5 text-center text-lg font-semibold">
        {label}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-10 rounded-xl theme-shadcn"
        aria-label="Следующий месяц"
        onClick={() => changeMonth(1)}
      >
        <ArrowRight aria-hidden="true" />
      </Button>
    </div>

  );
}
