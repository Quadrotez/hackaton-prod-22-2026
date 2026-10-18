"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  formatTransferEndsAt,
  transferPersonLabel,
  transferStatusLabels,
  type PetTransfer,
} from "@/lib/transfers";
import { PetAvatar } from "@/components/pet-avatar";
import { formatPetSummary } from "@/lib/pets";

export function TransferEntry({ transfer, children }: { transfer: PetTransfer; children?: ReactNode }) {
  const byOwner = transfer.role === "owner";
  const counterparty = byOwner
    ? transferPersonLabel(transfer.recipient, transfer.recipient_email)
    : transferPersonLabel(transfer.owner, transfer.owner.email);

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start gap-3">
        <PetAvatar pet={{ ...transfer.pet, photo_url: null, access: byOwner ? "owner" : "caretaker" }} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
          <Link href={`/transfers/${transfer.id}`} className="truncate font-medium underline-offset-4 hover:underline focus-visible:underline">{transfer.pet.name}</Link>
          <span className="text-xs text-muted-foreground">{formatPetSummary(transfer.pet)}</span>
          <span className="break-all text-xs text-muted-foreground">
            {byOwner ? "Кому" : "От кого"}: {counterparty}
          </span>
        </div>
        <div className="flex w-full flex-col gap-0.5 text-xs text-muted-foreground sm:w-auto sm:items-end">
          <span className="text-foreground">{transferStatusLabels[transfer.status]}</span>
          <span>{formatTransferEndsAt(transfer)}</span>
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 empty:hidden">{children}</div>}
    </li>
  );
}
