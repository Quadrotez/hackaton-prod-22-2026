"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/api";
import { login, registerAndLogin } from "@/lib/auth";
import { DEMO_PASSWORD, demoAccounts } from "@/lib/demo-accounts";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const credentialsSchema = z.object({
  email: z
    .string()
    .min(1, "Это обязательное поле")
    .email("Введите корректный email"),
  password: z.string().min(1, "Это обязательное поле"),
});

type CredentialsValues = z.infer<typeof credentialsSchema>;
type FormErrors = Partial<Record<keyof CredentialsValues, string>>;
type Mode = "login" | "register";

const switchModeClass = "h-auto p-0 text-sm text-foreground underline underline-offset-4 cursor-pointer";

function loginDestination(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && /^\/transfers(?:\/[1-9]\d*)?$/.test(next) ? next : "/me";
}

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);

  const isRegister = mode === "register";

  function switchMode(next: Mode) {
    setMode(next);
    setErrors({});
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    const formData = new FormData(e.currentTarget);
    const result = credentialsSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof CredentialsValues;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    if (isRegister && result.data.password.length < 8) {
      setErrors({ password: "Пароль должен содержать минимум 8 символов" });
      return;
    }

    setErrors({});
    setPending(true);
    try {
      if (isRegister) {
        await registerAndLogin(result.data);
      } else {
        await login(result.data);
      }
      router.push(loginDestination());
    } catch (error) {
      const fallback = isRegister
        ? "Не удалось зарегистрироваться"
        : "Не удалось войти";
      toast.error(getErrorMessage(error, fallback));
    } finally {
      setPending(false);
    }
  }

  async function handleDemoLogin(email: string) {
    if (pending) return;
    setErrors({});
    setPending(true);
    try {
      await login({ email, password: DEMO_PASSWORD });
      router.push(loginDestination());
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось войти в демо-аккаунт"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cardVariants({ className: "w-full max-w-sm" })}
    >
      <FieldSet>
        <div className="flex flex-col gap-1">
          <h2>{isRegister ? "Регистрация" : "Вход"}</h2>
          <p className="text-muted-foreground">
            {isRegister
              ? "Создайте аккаунт, чтобы управлять профилем питомца"
              : "Войдите, чтобы управлять профилем питомца"}
          </p>
        </div>
        <FieldGroup>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="name@example.com"
              aria-invalid={!!errors.email}
            />
            {errors.email && <FieldError>{errors.email}</FieldError>}
          </Field>

          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">Пароль</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              aria-invalid={!!errors.password}
            />
            {errors.password && (
              <FieldError>{errors.password}</FieldError>
            )}
          </Field>

          <Field>
            <Button
              className="bg-secondary md:bg-primary"
              type="submit"
              disabled={pending}
            >
              {pending && <Spinner />}
              {isRegister ? "Зарегистрироваться" : "Войти"}
            </Button>
          </Field>

          {!isRegister && (
            <Field>
              <p className="text-sm text-muted-foreground">Демо-аккаунты</p>
              <div className="grid gap-2">
                {demoAccounts.map((account) => (
                  <Button
                    key={account.email}
                    type="button"
                    variant="outline"
                    className="h-auto flex-col items-start gap-0 whitespace-normal py-2 text-left"
                    onClick={() => handleDemoLogin(account.email)}
                    disabled={pending}
                  >
                    <span className="font-medium">{account.title}</span>
                  </Button>
                ))}
              </div>
            </Field>
          )}

          <p className="text-center text-sm text-muted-foreground">
            {isRegister ? (
              <>
                Уже есть аккаунт?{" "}
                <Button type="button" variant="link" className={switchModeClass} onClick={() => switchMode("login")}>
                  Войти
                </Button>
              </>
            ) : (
              <>
                Нет аккаунта?{" "}
                <Button type="button" variant="link" className={switchModeClass} onClick={() => switchMode("register")}>
                  Зарегистрироваться
                </Button>
              </>
            )}
          </p>
        </FieldGroup>
      </FieldSet>
    </form>
  );
}
