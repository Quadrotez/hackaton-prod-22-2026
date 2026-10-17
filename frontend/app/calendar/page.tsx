import { Suspense } from "react";
import { connection } from "next/server";
import { CalendarPageView } from "@/components/calendar-page-view";
import { PageShell } from "@/components/page-shell";
import { PageLoading } from "@/components/page-state";

export const metadata = { title: "Календарь — PetCare" };

async function CurrentCalendar() {
  await connection();
  return <CalendarPageView />;
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CurrentCalendar />
    </Suspense>
  );
}
