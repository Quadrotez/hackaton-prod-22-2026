import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageError, PageLoading } from "@/components/page-state";
import { TransferDetails } from "@/components/transfer-details";

export const metadata: Metadata = { title: "Заявка на передачу — PetCare" };

export default function TransferPage({ params }: PageProps<"/transfers/[id]">) {
  return <PageShell>
    <Suspense fallback={<PageLoading />}>
      {params.then(({ id }) => {
        const transferId = Number(id);
        return Number.isSafeInteger(transferId) && transferId > 0
          ? <TransferDetails key={transferId} transferId={transferId} />
          : <PageError message="Заявка не найдена" backToList />;
      })}
    </Suspense>
  </PageShell>;
}
