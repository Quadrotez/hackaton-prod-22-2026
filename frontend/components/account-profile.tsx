"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import {
  CalendarCheckIcon,
  CalendarSyncIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  LinkIcon,
  LockIcon,
  LogOutIcon,
  MailIcon,
  MoonIcon,
  PawPrintIcon,
  PencilIcon,
  SunIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useProtectedData, useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { getMe, updateMe, updatePassword, uploadAvatar, type UserPublic } from "@/lib/auth";
import { listPets, pluralize } from "@/lib/pets";
import {
  createCalendarFeed,
  deleteCalendarFeed,
  downloadCalendarFile,
  feedUrls,
  getCalendarFeed,
} from "@/lib/calendar-feed";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { PhotoUploadButton } from "@/components/photo-upload-button";
import { UserAvatar } from "@/components/user-avatar";
import { clearAccessToken } from "@/lib/session";
import { getTheme, setTheme, subscribeToTheme, type Theme } from "@/lib/theme";
import { useRouter } from "next/navigation";

const nameSchema = z.string().trim().min(1, "Введите имя").max(100, "Не больше 100 символов");

const passwordSchema = z.object({
  current_password: z.string().min(8, "Пароль должен содержать минимум 8 символов"),
  new_password: z.string().min(8, "Пароль должен содержать минимум 8 символов"),
});

type PasswordErrors = Partial<Record<"current_password" | "new_password", string>>;

const chipClass =
  "inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium";

const iconButtonClass = "text-muted-foreground";

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function NameEditor({ user, onSaved }: { user: UserPublic; onSaved: (user: UserPublic) => void }) {
  const { handleAuthError } = useRequireAuth();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = nameSchema.safeParse(new FormData(event.currentTarget).get("name"));
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    if (result.data === user.name) {
      cancel();
      return;
    }

    setPending(true);
    try {
      onSaved(await updateMe({ name: result.data }));
      toast.success("Имя сохранено");
      cancel();
    } catch (err) {
      if (!handleAuthError(err)) toast.error(getErrorMessage(err, "Не удалось сохранить имя. Попробуйте ещё раз"));
    } finally {
      setPending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") cancel();
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-1.5">
        <div className="flex items-center gap-4">
          <Input
            name="name"
            defaultValue={user.name ?? ""}
            placeholder="Как вас зовут?"
            aria-label="Имя"
            aria-invalid={!!error}
            aria-describedby={error ? "account-name-error" : undefined}
            maxLength={100}
            autoFocus
            disabled={pending}
            onKeyDown={handleKeyDown}
            className="h-9 text-base md:text-base"
          />
          <div className="flex flex-row items-center gap-1">
            <Button type="submit" variant="ghost" size="icon" aria-label="Сохранить имя" title="Сохранить" disabled={pending} className={iconButtonClass}>
              {pending ? <Spinner /> : <CheckIcon aria-hidden="true" className="size-4" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Отменить" title="Отменить" disabled={pending} onClick={cancel} className={iconButtonClass}>
              <XIcon aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
        {error && (
          <p id="account-name-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-4">
      {user.name ? (
        <h2 className="truncate text-2xl font-bold tracking-tight">{user.name}</h2>
      ) : (
        <h2 className="truncate text-2xl font-bold tracking-tight text-muted-foreground">Без имени</h2>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={user.name ? "Изменить имя" : "Добавить имя"}
        title={user.name ? "Изменить имя" : "Добавить имя"}
        onClick={() => setEditing(true)}
        className={iconButtonClass}
      >
        <PencilIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

function ProfileHero({
  user,
  petCount,
  onUserChange,
}: {
  user: UserPublic;
  petCount: number | null;
  onUserChange: (user: UserPublic) => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div
        aria-hidden="true"
        className="h-24 bg-[radial-gradient(120%_140%_at_0%_0%,var(--primary)_0%,transparent_60%),radial-gradient(120%_140%_at_100%_100%,var(--secondary)_0%,transparent_70%)] bg-secondary/40"
      />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <div className="relative -mt-12 w-fit">
          <UserAvatar user={user} className="ring-4 ring-card" />
          <PhotoUploadButton
            hasPhoto={Boolean(user.avatar_url)}
            upload={async (file) => onUserChange(await uploadAvatar(file))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <NameEditor user={user} onSaved={onUserChange} />
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={chipClass}>
            <CalendarCheckIcon aria-hidden="true" className="size-3.5" />
            В PetCare с {formatDate(user.created_at)}
          </span>
          {petCount !== null && (
            <span className={chipClass}>
              <PawPrintIcon aria-hidden="true" className="size-3.5" />
              {petCount} {pluralize(petCount, "питомец", "питомца", "питомцев")}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  locked,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  locked?: string;
}) {
  return (
    <li className="flex items-center gap-3 border-t border-secondary pt-3 first:border-t-0 first:pt-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
        <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-medium">{value}</p>
      </div>
      {locked && (
        <LockIcon role="img" aria-label={locked} className="size-4 shrink-0 text-muted-foreground">
          <title>{locked}</title>
        </LockIcon>
      )}
    </li>
  );
}

function AccountDetails({ user }: { user: UserPublic }) {
  return (
    <Card className="flex flex-col gap-4">
      <h2>Данные аккаунта</h2>
      <ul className="flex flex-col gap-3">
        <InfoRow icon={MailIcon} label="Email" value={user.email} locked="Email нельзя изменить" />
        <InfoRow icon={CalendarCheckIcon} label="Дата регистрации" value={formatDate(user.created_at)} />
      </ul>
    </Card>
  );
}

function ThemeCard() {
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, (): Theme => "light");
  const dark = theme === "dark";
  const nextTheme: Theme = dark ? "light" : "dark";

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
          {dark ? (
            <SunIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          ) : (
            <MoonIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2>Тема оформления</h2>
          <p className="text-sm text-muted-foreground">{dark ? "Сейчас тёмная" : "Сейчас светлая"}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setTheme(nextTheme)}>
          {dark ? "Светлая тема" : "Тёмная тема"}
        </Button>
      </div>
    </Card>
  );
}

function PasswordChangeCard() {
  const { handleAuthError } = useRequireAuth();
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const result = passwordSchema.safeParse({
      current_password: formData.get("current_password"),
      new_password: formData.get("new_password"),
    });
    if (!result.success) {
      const fieldErrors: PasswordErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof PasswordErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    if (result.data.current_password === result.data.new_password) {
      setErrors({ new_password: "Новый пароль должен отличаться от текущего" });
      return;
    }

    setErrors({});
    setPending(true);
    try {
      await updatePassword(result.data);
      toast.success("Пароль изменён");
      formElement.reset();
    } catch (err) {
      if (!handleAuthError(err)) toast.error(getErrorMessage(err, "Не удалось изменить пароль. Попробуйте ещё раз"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
          <LockIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </span>
        <h2>Пароль</h2>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="current-password" className="text-xs text-muted-foreground">
            Текущий пароль
          </label>
          <Input
            id="current-password"
            name="current_password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.current_password}
            disabled={pending}
            className="h-9 text-base md:text-base"
          />
          {errors.current_password && (
            <p className="text-sm text-destructive">{errors.current_password}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-password" className="text-xs text-muted-foreground">
            Новый пароль
          </label>
          <Input
            id="new-password"
            name="new_password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.new_password}
            disabled={pending}
            className="h-9 text-base md:text-base"
          />
          {errors.new_password && (
            <p className="text-sm text-destructive">{errors.new_password}</p>
          )}
        </div>

        <Button type="submit" size="sm" disabled={pending} variant="secondary" className="self-start">
          {pending && <Spinner />}
          Сохранить
        </Button>
      </form>
    </Card>
  );
}

function CalendarFeedCard() {
  const { handleAuthError } = useRequireAuth();
  const load = useCallback(() => getCalendarFeed(), []);
  const state = useProtectedData(load, "Не удалось загрузить настройки календаря");
  // Ссылка приходит только в ответе на создание: бэкенд хранит лишь хеш токена.
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState<"create" | "delete" | "download" | null>(null);

  async function run(action: NonNullable<typeof pending>, task: () => Promise<void>, fallback: string) {
    setPending(action);
    try {
      await task();
    } catch (err) {
      if (!handleAuthError(err)) toast.error(getErrorMessage(err, fallback));
    } finally {
      setPending(null);
    }
  }

  const create = () =>
    run("create", async () => {
      const feed = await createCalendarFeed();
      setLink(feed.path);
      if (state.status === "ready") state.update(feed);
    }, "Не удалось создать ссылку. Попробуйте ещё раз");

  const remove = () =>
    run("delete", async () => {
      await deleteCalendarFeed();
      setLink(null);
      if (state.status === "ready") state.update({ active: false, timezone: null, created_at: null });
      toast.success("Подписка отключена");
    }, "Не удалось отключить подписку. Попробуйте ещё раз");

  const download = () =>
    run("download", downloadCalendarFile, "Не удалось скачать календарь. Попробуйте ещё раз");

  const active = state.status === "ready" && state.data.active;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
          <CalendarSyncIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2>Календарь на телефоне</h2>
          <p className="text-sm text-muted-foreground">
            Визиты, прививки, обработки от паразитов и приёмы лекарств — в Google, Apple или Outlook
            Календаре. Подключается по ссылке-подписке, входить в Google не нужно.
          </p>
        </div>
      </div>

      {state.status === "loading" && <Spinner />}
      {state.status === "error" && <p className="text-sm text-destructive">{state.error}</p>}

      {link && <FeedLink path={link} />}

      {active && !link && (
        <p className="text-sm text-muted-foreground">
          Подписка активна (с {formatDate(state.data.created_at!)}). Ссылка показывается один раз —
          если потеряли, получите новую: старая перестанет работать.
        </p>
      )}

      {state.status === "ready" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {!link && (
            <Button type="button" onClick={create} disabled={pending !== null} className="h-9 sm:flex-1">
              {pending === "create" ? <Spinner /> : <LinkIcon aria-hidden="true" />}
              {active ? "Получить новую ссылку" : "Получить ссылку для подписки"}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={download} disabled={pending !== null} className="h-9 sm:flex-1">
            {pending === "download" ? <Spinner /> : <DownloadIcon aria-hidden="true" />}
            Скачать .ics
          </Button>
          {active && (
            <Button type="button" variant="destructive" onClick={remove} disabled={pending !== null} className="h-9">
              {pending === "delete" && <Spinner />}
              Отключить
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function FeedLink({ path }: { path: string }) {
  const { https, webcal } = feedUrls(path);

  async function copy() {
    try {
      await navigator.clipboard.writeText(https);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать. Выделите ссылку и скопируйте вручную");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="calendar-feed-url" className="text-xs text-muted-foreground">
          Ссылка для подписки — сохраните её, повторно она не покажется
        </label>
        <div className="flex gap-2">
          <Input
            id="calendar-feed-url"
            readOnly
            value={https}
            onFocus={(event) => event.currentTarget.select()}
            className="h-9 min-w-0 flex-1 text-sm"
          />
          <Button type="button" variant="secondary" size="icon-lg" onClick={copy} aria-label="Скопировать ссылку">
            <CopyIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
      <a href={webcal} className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
        Открыть в Apple Календаре
      </a>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
        <li>
          <b className="font-medium text-foreground">Google:</b> calendar.google.com → «Другие календари» → «+» →
          «Добавить по URL». Google обновляет подписку раз в несколько часов и не показывает её напоминания.
        </li>
        <li>
          <b className="font-medium text-foreground">iPhone и Mac:</b> кнопка выше. Чтобы приходили напоминания,
          выключите «Удалять оповещения» при добавлении.
        </li>
        <li>
          <b className="font-medium text-foreground">Outlook:</b> «Добавить календарь» → «Подписаться из Интернета».
        </li>
      </ul>
    </div>
  );
}

export function AccountProfile() {
  const router = useRouter();
  const load = useCallback(() => Promise.all([getMe(), listPets().catch(() => null)]), []);
  const state = useProtectedData(load, "Не удалось загрузить профиль");

  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") return <PageError message={state.error} onRetry={state.retry} />;

  const [user, pets] = state.data;
  const handleUserChange = (updated: UserPublic) => state.update([updated, pets]);

  function handleLogout() {
    clearAccessToken();
    router.push("/");
  }

  return (
    <>
      <PageHeader title="Аккаунт" />
      <ProfileHero user={user} petCount={pets ? pets.filter((pet) => pet.access !== "caretaker").length : null} onUserChange={handleUserChange} />
      <AccountDetails user={user} />
      <ThemeCard />
      <Link href="/transfers" className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-foreground">
        <Card className="flex flex-col gap-1 transition-colors hover:bg-secondary/30"><h2>Передачи питомцев</h2><p className="text-sm text-muted-foreground">Входящие заявки, питомцы под присмотром и возвраты</p></Card>
      </Link>
      <PasswordChangeCard />
      <CalendarFeedCard />
      <Button onClick={() => handleLogout()}><LogOutIcon />Выйти</Button>
    </>
  );
}
