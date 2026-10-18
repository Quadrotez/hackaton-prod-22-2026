"use client";

import { useCallback, type ReactNode } from "react";
import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { useTransferData } from "@/hooks/use-transfer-data";
import { useNow } from "@/hooks/use-now";
import { currentTransfer, isOpenTransfer, listIncomingTransfers, listOutgoingTransfers, listReceivedTransfers, type PetTransfer } from "@/lib/transfers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { TransferEntry } from "@/components/transfer-entry";
import { TransferActions } from "@/components/transfer-actions";

function TransferSection({ id, title, empty, items, children }: {
  id: string;
  title: string;
  empty: string;
  items: PetTransfer[];
  children: (transfer: PetTransfer) => ReactNode;
}) {
  return <Card aria-labelledby={id} className="flex flex-col gap-4">
    <h2 id={id}>{title}</h2>
    {items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="divide-y">
      {items.map((transfer) => <TransferEntry key={transfer.id} transfer={transfer}>{children(transfer)}</TransferEntry>)}
    </ul>}
  </Card>;
}

export function TransfersManager() {
  const load = useCallback(() => Promise.all([listIncomingTransfers(), listReceivedTransfers(), listOutgoingTransfers()]), []);
  const state = useTransferData(load, "Не удалось загрузить передачи");
  const now = useNow(1_000);

  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") return <PageError message={state.error} onRetry={state.retry} />;

  const [incoming, received, outgoing] = state.data.map((items) => items.map((item) => currentTransfer(item, now)).filter(isOpenTransfer));
  const handleChange = (updated: PetTransfer) => state.mutate((lists) => {
    const next = lists.map((items) => items.filter((item) => item.id !== updated.id)) as typeof lists;
    if (isOpenTransfer(updated)) {
      const index = updated.role === "owner" ? 2 : updated.status === "pending" ? 0 : 1;
      next[index] = [updated, ...next[index]];
    }
    return next;
  });
  const actions = (transfer: PetTransfer) => <>
    {(transfer.status === "accepted" || transfer.status === "return_requested") && <Link href={`/pet/${transfer.pet.id}`} className="text-sm underline underline-offset-4">Профиль, здоровье и календарь</Link>}
    {transfer.status === "return_requested" && <p className="w-full text-xs text-muted-foreground">
      {transfer.role === "owner" ? "Получатель просит завершить присмотр. Вы можете забрать питомца сразу." : "Возврат запрошен — ждём подтверждения владельца."}
    </p>}
    {transfer.role === "owner" && transfer.status === "accepted" && <p className="text-xs text-muted-foreground">Получатель принял заявку. Вы можете забрать питомца сразу, без запроса или согласия помощника.</p>}
    <TransferActions key={`${transfer.id}:${transfer.status}`} transfer={transfer} onChange={handleChange} onRefresh={state.refresh} />
  </>;

  return <>
    <div className="flex items-center justify-between gap-3">
      <PageHeader title="Передачи" backHref="/me" />
      <Button type="button" variant="ghost" size="icon" aria-label="Обновить передачи" disabled={state.refreshing} onClick={() => { void state.refresh(); }}>
        <RefreshCwIcon aria-hidden="true" className={state.refreshing ? "size-4 animate-spin" : "size-4"} />
      </Button>
    </div>
    <p className="text-sm leading-5 text-muted-foreground">Здесь можно принять питомца на время и договориться о возврате. Для получения заявки войдите с email, который указал владелец.</p>
    {state.refreshError && <Card role="alert" className="text-sm text-destructive">{state.refreshError} Показаны последние загруженные данные.</Card>}
    <TransferSection id="incoming-title" title="Входящие заявки" empty="Новых заявок нет" items={incoming}>{actions}</TransferSection>
    <TransferSection id="received-title" title="Я присматриваю" empty="Вы сейчас не присматриваете ни за одним питомцем" items={received}>{actions}</TransferSection>
    <TransferSection id="outgoing-title" title="Мои заявки" empty="Активных передач нет" items={outgoing}>{actions}</TransferSection>
    <p className="text-sm leading-5 text-muted-foreground">После принятия питомец появится в группе «Присматриваю». Получателю доступны календарь и здоровье; редактировать профиль, прививки и назначения может владелец.</p>
  </>;
}
