"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { z } from "zod";
import { toast } from "sonner";
import { RefreshCwIcon } from "lucide-react";
import { useRequireAuth } from "@/hooks/use-auth";
import { useTransferData } from "@/hooks/use-transfer-data";
import { useNow } from "@/hooks/use-now";
import { ApiError, getErrorMessage } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { getPet } from "@/lib/pets";
import {
  createTransfer,
  currentTransfer,
  customEndDateError,
  formatTransferDate,
  formatTransferEndsAt,
  isOpenTransfer,
  listPetTransfers,
  MAX_TRANSFER_DAYS,
  toDateInput,
  transferCreatePayload,
  transferEndDate,
  transferDurationLabel,
  transferDurationOptions,
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
import { TransferActions } from "./transfer-actions";
import { TransferLink } from "./transfer-link";
import { Spinner } from "./ui/spinner";

const emailSchema = z.email("Введите корректный email получателя");
const customDatesEnabled = process.env.NEXT_PUBLIC_TRANSFER_CUSTOM_DATES_ENABLED !== "false";

export function PetTransfer({ petId }: { petId: number }) {
  const load = useCallback(() => Promise.all([getPet(petId), listPetTransfers(petId), getMe()]), [petId]);
  const state = useTransferData(load, "Не удалось загрузить передачу");
  const { handleAuthError } = useRequireAuth();
  const now = useNow(1_000);
  const locked = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [duration, setDuration] = useState<TransferPeriodChoice>("week");
  const [customDate, setCustomDate] = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") {
    return <PageError message={state.error} onRetry={state.retry} backToList />;
  }

  const [pet, loadedTransfers, user] = state.data;
  const transfers = loadedTransfers.map((item) => currentTransfer(item, now));
  const current = transfers.find(isOpenTransfer) ?? null;
  const history = transfers.filter((item) => !isOpenTransfer(item));
  const cleanEmail = email.trim().toLowerCase();
  const durationLabel = transferDurationLabel(duration);
  const endDate = transferEndDate(duration, customDate, new Date(now));
  const periodError = duration === "custom" ? customEndDateError(endDate, new Date(now)) : null;

  function validateEmail(): boolean {
    const result = emailSchema.safeParse(cleanEmail);
    const message = !result.success ? result.error.issues[0].message
      : cleanEmail === user.email.toLowerCase() ? "Укажите email другого человека" : null;
    setEmailError(message);
    if (message) emailInput.current?.focus();
    return message === null;
  }

  function openConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDateTouched(true);
    if (!locked.current && validateEmail() && !periodError) {
      setError(null);
      setConfirmOpen(true);
    }
  }

  const handleCreate = async () => {
    if (locked.current || current || !validateEmail()) return;
    const end = duration === "custom" ? transferEndDate(duration, customDate, new Date()) : null;
    if (duration === "custom" && customEndDateError(end, new Date())) {
      setDateTouched(true);
      setConfirmOpen(false);
      return;
    }
    locked.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createTransfer(petId, transferCreatePayload(cleanEmail, duration, end));
      state.mutate(([currentPet, items, currentUser]) => [currentPet, [created, ...items.filter((item) => item.id !== created.id)], currentUser]);
      setEmail("");
      setConfirmOpen(false);
      toast.success("Заявка создана. Отправьте получателю ссылку или попросите открыть раздел «Передачи»");
    } catch (e) {
      if (!handleAuthError(e)) {
        setError(getErrorMessage(e, "Не удалось отправить заявку"));
        if (e instanceof ApiError && e.status === 409) {
          setConfirmOpen(false);
          void state.refresh();
        }
      }
    } finally {
      locked.current = false;
      setSubmitting(false);
    }
  };

  const handleChange = (updated: TransferRecord) => {
    state.mutate(([currentPet, items, currentUser]) => [currentPet, items.map((item) => item.id === updated.id ? updated : item), currentUser]);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageHeader title="Поделиться питомцем" backHref={`/pet/${petId}`} />
        <Button type="button" variant="ghost" size="icon" aria-label="Обновить передачу" disabled={state.refreshing} onClick={() => { void state.refresh(); }}><RefreshCwIcon aria-hidden="true" className={state.refreshing ? "size-4 animate-spin" : "size-4"} /></Button>
      </div>

      <PetCard pet={pet} />

      {state.refreshError && <Card role="alert" className="text-sm text-destructive">{state.refreshError} Показаны последние загруженные данные.</Card>}

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
              <dd>{formatTransferEndsAt(current)}</dd>
            </div>
          </dl>

          {current.status === "return_requested" && (
            <p className="text-sm text-muted-foreground">
              Получатель просит завершить присмотр. Нажмите «Забрать питомца», когда питомец будет у вас.
            </p>
          )}
          {current.status === "accepted" && (
            <p className="text-sm text-muted-foreground">
              Вы можете забрать питомца в любой момент. Запрос или согласие получателя не нужны — доступ закроется сразу.
            </p>
          )}

          {error && !confirmOpen && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {current.status === "pending" && <p className="text-sm leading-5 text-muted-foreground">Письмо автоматически не отправляется. Отправьте человеку ссылку на заявку или попросите войти с указанным email и открыть «Передачи».</p>}
          {current.status === "pending" && <TransferLink transferId={current.id} />}
          <TransferActions key={`${current.id}:${current.status}`} transfer={current} onChange={handleChange} onRefresh={state.refresh} />
        </Card>
      )}

      {!current && (
        <Card>
        <form onSubmit={openConfirmation} noValidate className="flex flex-col gap-5" aria-busy={submitting}>
          <div className="flex flex-col gap-1">
            <h2>Передать на время</h2>
            <p className="text-sm leading-5 text-muted-foreground">
              Укажите email человека, который будет присматривать за питомцем. Он примет приглашение в своём аккаунте. Вы остаётесь владельцем и можете забрать питомца в любой момент.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="transfer-email" className="text-sm text-muted-foreground">
              Email получателя
            </label>
            <Input
              ref={emailInput}
              id="transfer-email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(null); setError(null); }}
              required
              disabled={submitting}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "transfer-email-error" : "transfer-email-hint"}
              placeholder="name@example.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            {emailError && <p id="transfer-email-error" role="alert" className="text-sm text-destructive">{emailError}</p>}
            <p id="transfer-email-hint" className="text-xs text-muted-foreground">Если аккаунта ещё нет, получатель сможет зарегистрироваться с этим email.</p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">На сколько</p>
            <div role="radiogroup" aria-label="Срок передачи" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {transferDurationOptions.filter((option) => customDatesEnabled || option.value !== "custom").map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-center rounded-lg text-sm transition-colors focus-within:ring-2 focus-within:ring-foreground",
                    duration === option.value
                      ? "bg-foreground text-background"
                      : "bg-foreground/5 hover:bg-foreground/10",
                  )}
                >
                  <input type="radio" name="duration" value={option.value} checked={duration === option.value} disabled={submitting} onChange={() => setDuration(option.value)} className="sr-only" />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <p className="text-xs leading-5 text-muted-foreground">Срок отсчитывается с момента отправки заявки, включая ожидание ответа.</p>
          {duration === "custom" && <div className="flex flex-col gap-2">
            <label htmlFor="transfer-end" className="text-sm">Дата окончания</label>
            <Input id="transfer-end" type="date" value={customDate} disabled={submitting} min={toDateInput(new Date(now))} max={toDateInput(new Date(now + MAX_TRANSFER_DAYS * 86_400_000))} onChange={(event) => { setCustomDate(event.target.value); setDateTouched(true); }} aria-invalid={dateTouched && Boolean(periodError)} aria-describedby={dateTouched && periodError ? "transfer-end-error" : undefined} />
            {dateTouched && periodError && <p id="transfer-end-error" role="alert" className="text-sm text-destructive">{periodError}</p>}
          </div>}
          {endDate && !periodError && <p className="text-xs text-muted-foreground">Доступ {formatTransferEndsAt({ ends_at: endDate.toISOString(), duration })}</p>}

          {error && !confirmOpen && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Отправляем…" : "Отправить заявку"}
          </Button>
        </form>
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

      <p className="text-sm leading-5 text-muted-foreground">После принятия заявки получатель увидит профиль, календарь и здоровье питомца, сможет записывать кормления и наблюдения. Редактирование профиля, прививок и назначений остаётся у владельца.</p>
      <Link href="/transfers" className="text-sm underline underline-offset-4">Все входящие и исходящие заявки</Link>

      <Dialog open={confirmOpen && !current} onOpenChange={(open) => { if (!submitting) setConfirmOpen(open); }}>
        <DialogContent showCloseButton={!submitting}>
          <DialogHeader>
            <DialogTitle>Отправить заявку?</DialogTitle>
            <DialogDescription>
              Передать питомца {pet.name} человеку с email {cleanEmail} на срок {durationLabel}{endDate ? `, до ${formatTransferDate(endDate.toISOString())}` : ""}. Срок начинается сразу после отправки. Получателю нужно принять заявку; письмо автоматически не отправляется.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={submitting}>Отмена</Button>} />
            <Button type="button" onClick={handleCreate} disabled={submitting}>
              {submitting && <Spinner />}{submitting ? "Отправляем…" : "Отправить заявку"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
