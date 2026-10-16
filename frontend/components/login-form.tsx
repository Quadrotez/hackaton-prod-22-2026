"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { loginAndStore, registerAndLogin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "./ui/spinner";

const credentialsSchema = z.object({
  email: z
    .string()
    .min(1, "Это обязательное поле")
    .email("Введите корректный email"),
  password: z
    .string()
    .min(8, "Пароль должен содержать минимум 8 символов"),
});

type CredentialsValues = z.infer<typeof credentialsSchema>;
type FormErrors = Partial<Record<keyof CredentialsValues | "form", string>>;
type Mode = "login" | "register";

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

    setErrors({});
    setPending(true);
    try {
      if (isRegister) {
        await registerAndLogin(result.data);
      } else {
        await loginAndStore(result.data);
      }
      router.push("/me");
    } catch (error) {
      const fallback = isRegister
        ? "Не удалось зарегистрироваться"
        : "Не удалось войти";
      const message =
        error instanceof ApiError ? error.detail : fallback;
      setErrors({ form: message });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="w-full max-w-sm rounded-xl bg-white/90 p-6"
    >
      <FieldSet>
        <div className="flex flex-col gap-1">
          <h4>{isRegister ? "Регистрация" : "Вход"}</h4>
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

          {errors.form && <FieldError>{errors.form}</FieldError>}

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

          <p className="text-center text-sm text-muted-foreground">
            {isRegister ? (
              <>
                Уже есть аккаунт?{" "}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => switchMode("login")}
                >
                  Войти
                </button>
              </>
            ) : (
              <>
                Нет аккаунта?{" "}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => switchMode("register")}
                >
                  Зарегистрироваться
                </button>
              </>
            )}
          </p>
        </FieldGroup>
      </FieldSet>
    </form>
  );
}
