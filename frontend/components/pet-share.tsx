"use client";

import { useCallback, useState } from "react";
import { XIcon } from "lucide-react";
import { useProtectedData } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import {
  createShare,
  deleteShare,
  durationOptions,
  formatExpiry,
  getPet,
  isActive,
  listShares,
  type PetShare as PetShareType,
} from "@/lib/pets";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ShareRow({
  share,
  busy,
  onRevoke,
}: {
  share: PetShareType;
  busy: boolean;
  onRevoke: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-sm font-medium"
      >
        {share.email.charAt(0).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate">{share.email}</span>
        <span className="text-xs text-muted-foreground">{formatExpiry(share.expires_at)}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={busy}
        onClick={onRevoke}
        aria-label={`Закрыть доступ для ${share.email}`}
      >
        <XIcon aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </Button>
    </li>
  );
}

export function PetShare({ petId }: { petId: number }) {
  const load = useCallback(() => Promise.all([getPet(petId), listShares(petId)]), [petId]);
  const state = useProtectedData(load, "Не удалось загрузить питомца");

  const [email, setEmail] = useState("");
  const [hours, setHours] = useState<number>(durationOptions[2].hours);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") {
    return <PageError message={state.error} onRetry={state.retry} backToList />;
  }

  const [pet, shares] = state.data;
  const { update } = state;
  const active = shares.filter(isActive);
  const cleanEmail = email.trim().toLowerCase();
  const isValidEmail = EMAIL_RE.test(cleanEmail);
  const durationLabel = durationOptions.find((o) => o.hours === hours)?.label;

  async function handleCreate() {
    if (!isValidEmail) return;
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    try {
      const created = await createShare(petId, { email: cleanEmail, expires_in_hours: hours });
      update([pet, [created, ...shares.filter((s) => s.email !== created.email)]]);
      setEmail("");
    } catch (e) {
      setError(getErrorMessage(e, "Не удалось предоставить доступ"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(shareId: number) {
    setRevokingId(shareId);
    setError(null);
    try {
      await deleteShare(petId, shareId);
      update([pet, shares.filter((s) => s.id !== shareId)]);
    } catch (e) {
      setError(getErrorMessage(e, "Не удалось закрыть доступ"));
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <>
      <PageHeader title="Поделиться" backHref={`/pet/${petId}`} />

      <PetCard pet={pet} />

      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2>Доступ на время отъезда</h2>
          <p className="text-sm leading-5 text-muted-foreground">
            Человек увидит профиль питомца, аллергии, корм и заметки, но не сможет ничего менять.
            Когда срок закончится, доступ закроется сам.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="share-email" className="text-sm text-muted-foreground">
            Email получателя
          </label>
          <Input
            id="share-email"
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
          <p className="text-sm text-muted-foreground">На сколько</p>
          <div role="radiogroup" aria-label="Срок доступа" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {durationOptions.map((option) => (
              <button
                key={option.hours}
                type="button"
                role="radio"
                aria-checked={hours === option.hours}
                onClick={() => setHours(option.hours)}
                className={cn(
                  "h-8 rounded-lg text-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-foreground active:scale-[0.98]",
                  hours === option.hours
                    ? "bg-foreground text-background"
                    : "bg-foreground/5 hover:bg-foreground/10",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button
          type="button"
          disabled={!isValidEmail || submitting}
          onClick={() => setConfirmOpen(true)}
        >
          {submitting ? "Отправляем…" : "Предоставить доступ"}
        </Button>
      </Card>

      {active.length > 0 && (
        <Card className="flex flex-col gap-1">
          <h2>Сейчас есть доступ</h2>
          <ul className="divide-y">
            {active.map((share) => (
              <ShareRow
                key={share.id}
                share={share}
                busy={revokingId === share.id}
                onRevoke={() => handleRevoke(share.id)}
              />
            ))}
          </ul>
        </Card>
      )}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Выдать доступ?</DialogTitle>
            <DialogDescription>
              Вы собираетесь выдать доступ к питомцу {pet.name} для {cleanEmail} на {durationLabel}.
              Человек сможет смотреть профиль, аллергии, корм и заметки. Закрыть доступ можно в любой момент.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Отмена</DialogClose>
            <Button type="button" onClick={handleCreate} disabled={submitting}>
              Выдать доступ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
