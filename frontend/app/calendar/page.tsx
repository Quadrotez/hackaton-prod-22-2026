import { Suspense } from "react";
import { connection } from "next/server";
import { CalendarView } from "@/components/calendar-view";
import { PageShell } from "@/components/page-shell";
import { PageLoading } from "@/components/page-state";

async function CurrentCalendar() {
  await connection();
  const today = new Date();
  return <CalendarView initialDate={[today.getFullYear(), today.getMonth(), today.getDate()]} />;
}

export default function CalendarPage() {
  return (
    <PageShell contentClassName="max-w-2xl">
      <Suspense fallback={<PageLoading />}>
        <CurrentCalendar />
      </Suspense>
    </PageShell>
  );
}
