"use client";

import { useCallback, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  CalendarCheckIcon,
  CheckIcon,
  LockIcon,
  MailIcon,
  PawPrintIcon,
  PencilIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useProtectedData, useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { getMe, updateMe, updatePassword, uploadAvatar, type UserPublic } from "@/lib/auth";
import { listPets, pluralize } from "@/lib/pets";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/page-header";
import { PageError, PageLoading } from "@/components/page-state";
import { PhotoUploadButton } from "@/components/photo-upload-button";
import { UserAvatar } from "@/components/user-avatar";
import Image from "next/image";
import { clearAccessToken } from "@/lib/session";
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

function GoogleCalendarCard() {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="">
          <Image src="/google_calendar.webp" width={32} height={32} alt="Google Calendar" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2>Google Календарь</h2>
          <p className="text-sm text-muted-foreground">
            Кормления, прививки и визиты к ветеринару появятся в вашем календаре с напоминаниями
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" disabled className="h-9 w-full">
        Подключить Google Календарь
      </Button>
    </Card>
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
      <ProfileHero user={user} petCount={pets?.length ?? null} onUserChange={handleUserChange} />
      <AccountDetails user={user} />
      <PasswordChangeCard />
      <GoogleCalendarCard />
      <Button onClick={() => handleLogout()}>Выйти</Button>
    </>
  );
}
