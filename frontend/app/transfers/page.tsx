import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/page-shell";
import { PageLoading } from "@/components/page-state";
import { TransfersManager } from "@/components/transfers-manager";

export const metadata: Metadata = {
  title: "Передачи — PetCare",
};

export default function TransfersPage() {
  return (
    <PageShell>
      <Suspense fallback={<PageLoading />}><TransfersManager /></Suspense>
    </PageShell>
  );
}
