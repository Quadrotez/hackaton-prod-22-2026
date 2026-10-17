import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { TransfersManager } from "@/components/transfers-manager";

export const metadata: Metadata = {
  title: "Передачи — PetCare",
};

export default function TransfersPage() {
  return (
    <PageShell>
      <TransfersManager />
    </PageShell>
  );
}
