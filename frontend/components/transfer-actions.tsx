"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useActivePet } from "@/components/active-pet-provider";
import { useRequireAuth } from "@/hooks/use-auth";
import { ApiError, getErrorMessage } from "@/lib/api";
import {
  acceptTransfer, cancelTransfer, cancelTransferReturn,
  declineTransfer, endTransfer, requestTransferReturn, type PetTransfer,
} from "@/lib/transfers";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Action = {
  label: string;
  description: string;
  success: string;
  run: (id: number) => Promise<PetTransfer>;
  secondary?: boolean;
};

function availableActions(transfer: PetTransfer): Action[] {
  if (transfer.role === "owner") {
    if (transfer.status === "accepted" || transfer.status === "return_requested") return [{
      label: "Забрать питомца", description: "Питомец сразу вернётся к вам в приложении. Доступ помощника закроется, его согласие или запрос на возврат не нужны.",
      success: "Передача завершена, доступ закрыт", run: endTransfer, secondary: true,
    }];
    if (transfer.status === "pending") return [{
      label: "Отменить заявку", description: "Получатель больше не сможет принять эту заявку.",
      success: "Заявка отменена", run: cancelTransfer, secondary: true,
    }];
  } else {
    if (transfer.status === "pending") return [
      { label: "Принять", description: `Вы соглашаетесь присматривать за питомцем ${transfer.pet.name}. Владельцем остаётся ${transfer.owner.name || transfer.owner.email}.`, success: "Заявка принята", run: acceptTransfer },
      { label: "Отклонить", description: "Заявка будет закрыта. Владелец сможет отправить новую.", success: "Заявка отклонена", run: declineTransfer, secondary: true },
    ];
    if (transfer.status === "accepted") return [{
      label: "Запросить возврат", description: "Владелец получит запрос и подтвердит, что питомец вернулся. До подтверждения передача останется активной.",
      success: "Запрос на возврат отправлен", run: requestTransferReturn, secondary: true,
    }];
    if (transfer.status === "return_requested") return [{
      label: "Отменить запрос на возврат", description: "Передача останется активной, а подтверждение владельца больше не потребуется.",
      success: "Запрос на возврат отменён", run: cancelTransferReturn, secondary: true,
    }];
  }
  return [];
}

export function TransferActions({ transfer, onChange, onRefresh }: {
  transfer: PetTransfer;
  onChange: (updated: PetTransfer) => void;
  onRefresh: () => void;
}) {
  const { handleAuthError } = useRequireAuth();
  const { refreshPets, selectPet } = useActivePet();
  const [confirmation, setConfirmation] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const actions = availableActions(transfer);

  async function submit(action: Action) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError(null);
    try {
      const updated = await action.run(transfer.id);
      onChange(updated);
      await refreshPets();
      if (updated.role === "recipient" && updated.status === "accepted") selectPet(updated.pet.id);
      setConfirmation(null);
      toast.success(action.success);
    } catch (cause) {
      if (!handleAuthError(cause)) {
        setError(getErrorMessage(cause, "Не удалось изменить передачу. Попробуйте ещё раз"));
        if (cause instanceof ApiError && [403, 404, 409].includes(cause.status)) {
          setConfirmation(null);
          onRefresh();
        }
      }
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  if (actions.length === 0) return null;

  return <>
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => <Button key={action.label} type="button" size="sm" variant={action.secondary ? "outline" : "default"} disabled={pending} onClick={() => { setError(null); setConfirmation(action); }}>
        {action.label}
      </Button>)}
    </div>
    {error && !confirmation && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
    <Dialog open={confirmation !== null} onOpenChange={(open) => { if (!open && !pending) setConfirmation(null); }}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{confirmation?.label}?</DialogTitle>
          <DialogDescription>{confirmation?.description}</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={pending}>Назад</Button>} />
          <Button type="button" disabled={pending || !confirmation} onClick={() => { if (confirmation) void submit(confirmation); }}>
            {pending && <Spinner />}{pending ? "Сохраняем…" : confirmation?.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
