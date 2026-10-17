"use client";

import type { ReactNode } from "react";
import {
  formatTransferEndsAt,
  transferDurationLabel,
  transferPersonLabel,
  transferStatusLabels,
  type PetTransfer,
} from "@/lib/transfers";
import { PetAvatar } from "@/components/pet-avatar";

export function TransferEntry({ transfer, children }: { transfer: PetTransfer; children?: ReactNode }) {
  const byOwner = transfer.role === "owner";
  const counterparty = byOwner
    ? transferPersonLabel(transfer.recipient, transfer.recipient_email)
    : transferPersonLabel(transfer.owner, transfer.owner.email);

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <PetAvatar pet={{ ...transfer.pet, photo_url: null }} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-medium">{transfer.pet.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {byOwner ? "Кому" : "От кого"}: {counterparty}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
          <span className="text-foreground">{transferStatusLabels[transfer.status]}</span>
          <span>
            {transferDurationLabel(transfer.duration)} · {formatTransferEndsAt(transfer)}
          </span>
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </li>
  );
}
