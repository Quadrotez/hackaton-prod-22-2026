"use client";

import { useCallback, useState } from "react";
import { useProtectedData } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import {
  acceptTransfer,
  cancelTransfer,
  cancelTransferReturn,
  confirmTransferReturn,
  declineTransfer,
  isOpenTransfer,
  listIncomingTransfers,
  listOutgoingTransfers,
  listReceivedTransfers,
  requestTransferReturn,
  type PetTransfer,
} from "@/lib/transfers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { TransferEntry } from "./transfer-entry";

type TransferLists = [PetTransfer[], PetTransfer[], PetTransfer[]];

function withoutTransfer([incoming, received, outgoing]: TransferLists, id: number): TransferLists {
  return [
    incoming.filter((item) => item.id !== id),
    received.filter((item) => item.id !== id),
    outgoing.filter((item) => item.id !== id),
  ];
}

function placeTransfer(lists: TransferLists, updated: PetTransfer): TransferLists {
  const [incoming, received, outgoing] = withoutTransfer(lists, updated.id);
  if (!isOpenTransfer(updated)) return [incoming, received, outgoing];
  if (updated.role === "recipient") {
    return updated.status === "pending"
      ? [[updated, ...incoming], received, outgoing]
      : [incoming, [updated, ...received], outgoing];
  }
  return [incoming, received, [updated, ...outgoing]];
}

export function TransfersManager() {
  const load = useCallback(
    () => Promise.all([listIncomingTransfers(), listReceivedTransfers(), listOutgoingTransfers()]),
    [],
  );
  const state = useProtectedData(load, "Не удалось загрузить передачи");

  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") {
    return <PageError message={state.error} onRetry={state.retry} />;
  }

  const [incoming, received, outgoing] = state.data;

  const handleAction = async (
    transferId: number,
    action: (id: number) => Promise<PetTransfer>,
    failure: string,
  ) => {
    setBusyId(transferId);
    setError(null);
    try {
      const updated = await action(transferId);
      state.update(placeTransfer(state.data, updated));
    } catch (e) {
      setError(getErrorMessage(e, failure));
    } finally {
      setBusyId(null);
    }
  };

  const busy = (id: number) => busyId === id;

  return (
    <>
      <PageHeader title="Передачи" backHref="/me" />

      {error && (
        <Card role="alert" className="text-sm text-destructive">
          {error}
        </Card>
      )}

      <section aria-labelledby="incoming-title" className="flex flex-col gap-3">
        <h2 id="incoming-title">Входящие заявки</h2>
        {incoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Новых заявок нет</p>
        ) : (
          <Card>
            <ul className="divide-y">
              {incoming.map((transfer) => (
                <TransferEntry key={transfer.id} transfer={transfer}>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy(transfer.id)}
                    onClick={() => handleAction(transfer.id, acceptTransfer, "Не удалось принять заявку")}
                  >
                    Принять
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy(transfer.id)}
                    onClick={() => handleAction(transfer.id, declineTransfer, "Не удалось отклонить заявку")}
                  >
                    Отклонить
                  </Button>
                </TransferEntry>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="received-title" className="flex flex-col gap-3">
        <h2 id="received-title">У меня</h2>
        {received.length === 0 ? (
          <p className="text-sm text-muted-foreground">Вы сейчас не присматриваете ни за одним питомцем</p>
        ) : (
          <Card>
            <ul className="divide-y">
              {received.map((transfer) => (
                <TransferEntry key={transfer.id} transfer={transfer}>
                  {transfer.status === "accepted" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy(transfer.id)}
                      onClick={() =>
                        handleAction(transfer.id, requestTransferReturn, "Не удалось запросить возврат")
                      }
                    >
                      Передать обратно
                    </Button>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Возврат запрошен — ждём подтверждения владельца
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy(transfer.id)}
                        onClick={() =>
                          handleAction(transfer.id, cancelTransferReturn, "Не удалось отменить возврат")
                        }
                      >
                        Отменить возврат
                      </Button>
                    </>
                  )}
                </TransferEntry>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="outgoing-title" className="flex flex-col gap-3">
        <h2 id="outgoing-title">Переданные мной</h2>
        {outgoing.length === 0 ? (
          <p className="text-sm text-muted-foreground">Активных передач нет</p>
        ) : (
          <Card>
            <ul className="divide-y">
              {outgoing.map((transfer) => (
                <TransferEntry key={transfer.id} transfer={transfer}>
                  {transfer.status === "pending" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy(transfer.id)}
                      onClick={() => handleAction(transfer.id, cancelTransfer, "Не удалось отменить заявку")}
                    >
                      Отменить заявку
                    </Button>
                  )}
                  {transfer.status === "return_requested" && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy(transfer.id)}
                      onClick={() =>
                        handleAction(transfer.id, confirmTransferReturn, "Не удалось подтвердить возврат")
                      }
                    >
                      Подтвердить возврат
                    </Button>
                  )}
                </TransferEntry>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {incoming.length === 0 && received.length === 0 && outgoing.length === 0 && (
        <Card>
          <p className="text-sm leading-5 text-muted-foreground">
            Здесь появляются заявки, когда вам передают питомца, и питомцы, которых вы приняли на время.
          </p>
        </Card>
      )}
    </>
  );
}
