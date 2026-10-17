"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { ru } from "react-day-picker/locale"
import { cn } from "cn"

import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function DatePicker({
  id,
  name,
  defaultValue,
  placeholder = "Выберите дату",
  disableFuture,
  className,
  ...props
}: {
  id?: string
  name: string
  defaultValue?: string
  placeholder?: string
  disableFuture?: boolean
  className?: string
} & Pick<React.ComponentProps<"button">, "aria-invalid" | "aria-describedby">) {
  const [open, setOpen] = React.useState(false)
  const [date, setDate] = React.useState(() => parseIsoDate(defaultValue))
  const [today] = React.useState(() => new Date())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input type="hidden" name={name} value={date ? toIsoDate(date) : ""} />
      <PopoverTrigger
        id={id}
        className={cn(
          "flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1 text-left text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
          !date && "text-muted-foreground",
          className
        )}
        {...props}
      >
        {date ? date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : placeholder}
        <CalendarIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ru}
          captionLayout="dropdown"
          selected={date}
          defaultMonth={date ?? today}
          startMonth={new Date(today.getFullYear() - 40, 0)}
          endMonth={disableFuture ? today : new Date(today.getFullYear() + 10, 11)}
          disabled={disableFuture ? { after: today } : undefined}
          onSelect={(selected) => {
            setDate(selected)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
