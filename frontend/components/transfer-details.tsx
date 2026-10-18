"use client";

import { useCallback } from "react";
import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { useTransferData } from "@/hooks/use-transfer-data";
import { useNow } from "@/hooks/use-now";
import { currentTransfer, formatTransferDate, formatTransferEndsAt, getTransfer, transferDurationLabel, transferPersonLabel, transferStatusLabels } from "@/lib/transfers";
import { formatPetSummary } from "@/lib/pets";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { PetAvatar } from "@/components/pet-avatar";
import { TransferActions } from "@/components/transfer-actions";
import { TransferLink } from "@/components/transfer-link";

export function TransferDetails({ transferId }: { transferId: number }) {
  const load = useCallback(() => getTransfer(transferId), [transferId]);
  const state = useTransferData(load, "Не удалось загрузить заявку");
  const now = useNow(1_000);

  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") return <>
    <PageHeader title="Заявка на передачу" backHref="/transfers" />
    <PageError message={`${state.error}. Заявка доступна владельцу и получателю. Проверьте, что вы вошли с email, на который её отправили.`} onRetry={state.retry} />
  </>;

  const transfer = currentTransfer(state.data, now);
  const owner = transfer.role === "owner";
  return <>
    <div className="flex items-center justify-between gap-3">
      <PageHeader title="Заявка на передачу" backHref="/transfers" />
      <Button type="button" variant="ghost" size="icon" aria-label="Обновить заявку" disabled={state.refreshing} onClick={() => { void state.refresh(); }}><RefreshCwIcon aria-hidden="true" className={state.refreshing ? "size-4 animate-spin" : "size-4"} /></Button>
    </div>
    <Card className="flex items-center gap-4">
      <PetAvatar pet={{ ...transfer.pet, photo_url: null, access: owner ? "owner" : "caretaker" }} />
      <div className="flex min-w-0 flex-col gap-1"><h2 className="break-words">{transfer.pet.name}</h2><p className="text-sm text-muted-foreground">{formatPetSummary(transfer.pet)}</p></div>
    </Card>
    <Card className="flex flex-col gap-4">
      <h2 aria-live="polite">{transferStatusLabels[transfer.status]}</h2>
      <dl className="flex flex-col gap-3 text-sm">
        <div><dt className="text-muted-foreground">Владелец</dt><dd className="break-words">{transferPersonLabel(transfer.owner, transfer.owner.email)}</dd></div>
        <div><dt className="text-muted-foreground">Получатель</dt><dd className="break-words">{transferPersonLabel(transfer.recipient, transfer.recipient_email)}</dd></div>
        <div><dt className="text-muted-foreground">Срок</dt><dd>{transferDurationLabel(transfer.duration)} · {formatTransferEndsAt(transfer)}</dd></div>
        <div><dt className="text-muted-foreground">Отправлена</dt><dd>{formatTransferDate(transfer.created_at)}</dd></div>
        {transfer.responded_at && <div><dt className="text-muted-foreground">Ответ получателя</dt><dd>{formatTransferDate(transfer.responded_at)}</dd></div>}
        {transfer.ended_at && <div><dt className="text-muted-foreground">Завершена</dt><dd>{formatTransferDate(transfer.ended_at)}</dd></div>}
      </dl>
      {transfer.status === "pending" && <p className="text-sm text-muted-foreground">{owner ? "Получатель должен войти или зарегистрироваться с указанным email и принять заявку. Письмо автоматически не отправляется — можно отправить ссылку самостоятельно." : "Вас приглашают присмотреть за питомцем. Примите заявку, если согласны."}</p>}
      {transfer.status === "return_requested" && <p className="text-sm text-muted-foreground">{owner ? "Получатель просит завершить присмотр. Вы можете забрать питомца сразу." : "Ожидаем подтверждения владельца. До этого передача остаётся активной."}</p>}
      {transfer.status === "expired" && <p className="text-sm text-muted-foreground">Срок передачи закончился. Владелец может создать новую заявку.</p>}
      {state.refreshError && <p role="alert" className="text-sm text-destructive">{state.refreshError} Статус мог измениться — обновите заявку перед действием.</p>}
      <TransferActions key={transfer.status} transfer={transfer} onChange={state.update} onRefresh={state.refresh} />
      {owner && transfer.status === "pending" && <TransferLink transferId={transfer.id} />}
    </Card>
    {(transfer.status === "accepted" || transfer.status === "return_requested") && <Link href={`/pet/${transfer.pet.id}`} className="text-sm underline underline-offset-4">Открыть профиль, здоровье и календарь питомца</Link>}
    <p className="text-sm leading-5 text-muted-foreground">Владельцем остаётся {transfer.owner.name || transfer.owner.email}. После принятия заявки получатель видит календарь и здоровье, может записывать кормления и наблюдения. Профиль, прививки и назначения редактирует владелец.</p>
    {owner && <Link href={`/pet/${transfer.pet.id}/transfer`} className="text-sm underline underline-offset-4">Все передачи этого питомца</Link>}
  </>;
}
