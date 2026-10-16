"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/api";
import { login } from "@/lib/auth";
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
  password: z
    .string()
    .min(1, "Введите пароль"),
});

type CredentialsValues = z.infer<typeof credentialsSchema>;
type FormErrors = Partial<Record<keyof CredentialsValues, string>>;

export function LoginForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);

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
      await login(result.data);
      router.push("/me");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось войти"));
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
          <h2>Вход</h2>
          <p className="text-muted-foreground">
            Войдите, чтобы управлять профилем питомца
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
              Войти
            </Button>
          </Field>
        </FieldGroup>
      </FieldSet>
    </form>
  );
}
