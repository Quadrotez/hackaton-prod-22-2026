"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Введите email")
    .email("Введите корректный email"),
  password: z
    .string()
    .min(8, "Минимум 8 символов"),
});

type LoginValues = z.infer<typeof loginSchema>;
type LoginErrors = Partial<Record<keyof LoginValues, string>>;

export function LoginForm() {
  const [errors, setErrors] = useState<LoginErrors>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const result = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!result.success) {
      const fieldErrors: LoginErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof LoginValues;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setPending(true);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message =
          body?.detail && typeof body.detail === "string"
            ? body.detail
            : "Неверный email или пароль";
        setErrors({ password: message });
        return;
      }
      const token = (await response.json()) as { access_token: string };
      window.localStorage.setItem("access_token", token.access_token);
      window.location.assign("/");
    } catch {
      setErrors({ password: "Нет связи с сервером, попробуйте позже" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="w-full max-w-sm rounded-xl bg-secondary px-6 py-4"
    >
      <FieldSet>
        <FieldLegend><h3>Вход</h3></FieldLegend>
        <FieldDescription>
          Войдите, чтобы управлять профилем питомца.
        </FieldDescription>
        <FieldGroup>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
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
              autoComplete="current-password"
              aria-invalid={!!errors.password}
            />
            {errors.password ? (
              <FieldError>{errors.password}</FieldError>
            ) : (
              <FieldDescription>Пароль должен содержать не менее 8 символов</FieldDescription>
            )}
          </Field>

          <Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Входим…" : "Войти"}
            </Button>
          </Field>
        </FieldGroup>
      </FieldSet>
    </form>
  );
}