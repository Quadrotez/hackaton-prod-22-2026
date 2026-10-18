"use client";

import { useCallback, useState } from "react";
import { useProtectedData } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { getPet } from "@/lib/pets";
import {
  cancelTransfer,
  confirmTransferReturn,
  createTransfer,
  customEndDateError,
  endTransfer,
  formatTransferDate,
  isOpenTransfer,
  listPetTransfers,
  MAX_TRANSFER_DAYS,
  toDateInput,
  transferCreatePayload,
  transferDurationOptions,
  transferEndDate,
  transferPersonLabel,
  transferStatusLabels,
  type PetTransfer as TransferRecord,
  type TransferPeriodChoice,
} from "@/lib/transfers";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PetCard } from "./pet-card";
import { TransferEntry } from "./transfer-entry";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function replaceTransfer(transfers: TransferRecord[], updated: TransferRecord): TransferRecord[] {
  return transfers.map((item) => (item.id === updated.id ? updated : item));
}

export function PetTransfer({ petId }: { petId: number }) {
  const load = useCallback(() => Promise.all([getPet(petId), listPetTransfers(petId)]), [petId]);
  const state = useProtectedData(load, "Не удалось загрузить передачу");

  const [email, setEmail] = useState("");
  const [duration, setDuration] = useState<TransferPeriodChoice>("week");
  const [customDate, setCustomDate] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") {
    return <PageError message={state.error} onRetry={state.retry} backToList />;
  }

  const [pet, transfers] = state.data;
  const current = transfers.find(isOpenTransfer) ?? null;
  const history = transfers.filter((item) => !isOpenTransfer(item));
  const cleanEmail = email.trim().toLowerCase();
  const isValidEmail = EMAIL_RE.test(cleanEmail);
  const now = new Date();
  const endDate = transferEndDate(duration, customDate, now);
  const periodError = duration === "custom" ? customEndDateError(endDate, now) : null;
  const endLabel = endDate ? formatTransferDate(endDate.toISOString()) : null;
  const canSend = isValidEmail && !periodError;

  const handleCreate = async () => {
    if (!canSend) return;
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    try {
      // Re-read the clock: the dialog may have stayed open for a while.
      const end = duration === "custom" ? transferEndDate("custom", customDate, new Date()) : null;
      const created = await createTransfer(petId, transferCreatePayload(cleanEmail, duration, end));
      state.update([pet, [created, ...transfers]]);
      setEmail("");
    } catch (e) {
      setError(getErrorMessage(e, "Не удалось отправить заявку"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (
    transferId: number,
    action: (id: number) => Promise<TransferRecord>,
    failure: string,
  ) => {
    setBusyId(transferId);
    setError(null);
    try {
      const updated = await action(transferId);
      state.update([pet, replaceTransfer(transfers, updated)]);
    } catch (e) {
      setError(getErrorMessage(e, failure));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader title="Передача питомца" backHref={`/pet/${petId}`} />

      <PetCard pet={pet} />

      {current && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2>{current.status === "pending" ? "Заявка отправлена" : "Питомец сейчас передан"}</h2>
            <p className="text-sm leading-5 text-muted-foreground">{transferStatusLabels[current.status]}</p>
          </div>

          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Кому</dt>
              <dd className="truncate">{transferPersonLabel(current.recipient, current.recipient_email)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Действует</dt>
              <dd>{current.ends_at ? `до ${formatTransferDate(current.ends_at)}` : "бессрочно"}</dd>
            </div>
          </dl>

          {current.status === "return_requested" && (
            <p className="text-sm text-muted-foreground">
              Получатель просит вернуть питомца. Проверьте, что питомец дома, и подтвердите возврат.
            </p>
          )}
          {current.status === "accepted" && (
            <p className="text-sm text-muted-foreground">
              Пока передача действует, получатель видит питомца, может кормить его и добавлять симптомы, замеры
              и визиты, но не может ничего менять или удалять. Когда питомец вернётся, получатель запросит
              возврат — подтвердить его можно будет здесь.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {current.status === "pending" && (
              <Button
                type="button"
                variant="outline"
                disabled={busyId === current.id}
                onClick={() => handleAction(current.id, cancelTransfer, "Не удалось отменить заявку")}
              >
                Отменить заявку
              </Button>
            )}
            {current.status === "return_requested" && (
              <Button
                type="button"
                disabled={busyId === current.id}
                onClick={() => handleAction(current.id, confirmTransferReturn, "Не удалось подтвердить возврат")}
              >
                Подтвердить возврат
              </Button>
            )}
            {current.status === "accepted" && (
              <Button
                type="button"
                variant="outline"
                disabled={busyId === current.id}
                onClick={() => setEndOpen(true)}
              >
                Забрать досрочно
              </Button>
            )}
          </div>
        </Card>
      )}

      {!current && (
        <Card className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2>Передать на время</h2>
            <p className="text-sm leading-5 text-muted-foreground">
              Отправьте заявку человеку, который будет присматривать за питомцем. Он должен принять её, а когда
              питомец вернётся — вы подтвердите возврат. Владельцем питомца остаётесь вы.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="transfer-email" className="text-sm text-muted-foreground">
              Email получателя
            </label>
            <Input
              id="transfer-email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">На какой срок</p>
            <div role="radiogroup" aria-label="Срок передачи" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {transferDurationOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={duration === option.value}
                  onClick={() => setDuration(option.value)}
                  className={cn(
                    "h-8 rounded-lg text-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-foreground active:scale-[0.98]",
                    duration === option.value
                      ? "bg-foreground text-background"
                      : "bg-foreground/5 hover:bg-foreground/10",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {duration === "custom" && (
              <Input
                type="date"
                aria-label="Дата окончания передачи"
                value={customDate}
                min={toDateInput(now)}
                max={toDateInput(new Date(now.getTime() + MAX_TRANSFER_DAYS * 86_400_000))}
                onChange={(e) => setCustomDate(e.target.value)}
              />
            )}
            <p className={cn("text-sm", periodError && customDate ? "text-destructive" : "text-muted-foreground")}>
              {periodError
                ? (customDate ? periodError : "Выберите, до какого дня питомец будет у получателя")
                : `Доступ закроется ${endLabel}`}
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="button"
            disabled={!canSend || submitting}
            onClick={() => setConfirmOpen(true)}
          >
            {submitting ? "Отправляем…" : "Отправить заявку"}
          </Button>
        </Card>
      )}

      {history.length > 0 && (
        <Card className="flex flex-col gap-4">
          <h2>История передач</h2>
          <ul className="divide-y">
            {history.map((item) => (
              <TransferEntry key={item.id} transfer={item}>
                <span className="text-sm text-muted-foreground">
                  Передача от {formatTransferDate(item.created_at)}
                  {item.ended_at && ` — завершена ${formatTransferDate(item.ended_at)}`}
                </span>
              </TransferEntry>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отправить заявку?</DialogTitle>
            <DialogDescription>
              {pet.name} будет у {cleanEmail} до {endLabel}. Человек должен принять заявку; после этого он
              сможет кормить питомца и добавлять записи о здоровье, но не менять и не удалять данные.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline">Отмена</Button>} />
            <Button type="button" onClick={handleCreate} disabled={submitting}>
              Отправить заявку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Забрать питомца досрочно?</DialogTitle>
            <DialogDescription>
              Передача завершится сразу, и получатель потеряет доступ к {pet.name}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline">Отмена</Button>} />
            <Button
              type="button"
              onClick={() => {
                setEndOpen(false);
                if (current) void handleAction(current.id, endTransfer, "Не удалось завершить передачу");
              }}
            >
              Забрать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
