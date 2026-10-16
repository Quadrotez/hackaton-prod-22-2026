"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cat, Dog, PawPrint } from "lucide-react";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/auth";
import { createPet } from "@/lib/pets";
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
import { Spinner } from "@/components/ui/spinner";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const petSchema = z.object({
  name: z.string().trim().min(1, "Введите имя питомца").max(255, "Не больше 255 символов"),
  species: z.string().trim().min(1, "Укажите вид питомца").max(100, "Не больше 100 символов"),
  breed: z.string().trim().max(255, "Не больше 255 символов"),
  birth_date: z.union([z.literal(""), z.iso.date("Укажите корректную дату")])
    .refine((value) => !value || value <= today(), "Дата рождения не может быть в будущем"),
});

type FormErrors = Partial<Record<keyof z.infer<typeof petSchema> | "form", string>>;

const speciesOptions = [
  { value: "cat", label: "Кошка", icon: Cat },
  { value: "dog", label: "Собака", icon: Dog },
  { value: "other", label: "Другой", icon: PawPrint },
];

export function PetCreateForm() {
  const router = useRouter();
  const [species, setSpecies] = useState("cat");
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const result = petSchema.safeParse({
      name: formData.get("name"),
      species: species === "other" ? formData.get("customSpecies") : species,
      breed: formData.get("breed"),
      birth_date: formData.get("birth_date"),
    });

    console.log(formData.get("birth_date"))

    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof z.infer<typeof petSchema>;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      const firstField = result.error.issues[0]?.path[0];
      const fieldName = firstField === "species" ? "customSpecies" : firstField;
      const input = form.elements.namedItem(String(fieldName));
      if (input instanceof HTMLElement) input.focus();
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setNeedsLogin(true);
      setErrors({ form: "Войдите в аккаунт, чтобы сохранить питомца" });
      return;
    }

    setErrors({});
    setNeedsLogin(false);
    setPending(true);
    try {
      await createPet({
        ...result.data,
        breed: result.data.breed || null,
        birth_date: result.data.birth_date || null,
      }, token);
      router.replace("/me");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAccessToken();
        setNeedsLogin(true);
        setErrors({ form: "Сессия истекла. Войдите снова, чтобы сохранить питомца" });
      } else {
        setErrors({
          form: error instanceof ApiError ? error.detail : "Не удалось сохранить питомца. Попробуйте ещё раз",
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="w-full max-w-sm rounded-xl bg-white/90 p-6">
      <FieldSet disabled={pending}>
        <div className="flex flex-col gap-1">
          <h2 className="text-xl">Добавить питомца</h2>
          <p className="text-muted-foreground">Давайте познакомимся с вашим любимцем</p>
        </div>
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="pet-name">Имя питомца</FieldLabel>
            <Input id="pet-name" name="name" placeholder="Например, Барсик" maxLength={255} required aria-invalid={!!errors.name} aria-describedby={errors.name ? "pet-name-error" : undefined} />
            {errors.name && <FieldError id="pet-name-error">{errors.name}</FieldError>}
          </Field>

          <FieldSet className="gap-2">
            <FieldLegend variant="label">Кто ваш питомец?</FieldLegend>
            <div className="grid grid-cols-3 gap-2">
              {speciesOptions.map(({ value, label, icon: Icon }) => (
                <label key={value} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name="species"
                    value={value}
                    checked={species === value}
                    onChange={() => {
                      setSpecies(value);
                      setErrors((current) => ({ ...current, species: undefined }));
                    }}
                    className="peer sr-only"
                  />
                  <span className="flex flex-col items-center gap-2 rounded-lg border border-input px-2 py-3 text-sm transition-colors hover:bg-secondary/40 peer-checked:border-foreground/40 peer-checked:bg-secondary peer-focus-visible:ring-2 peer-focus-visible:ring-foreground peer-disabled:cursor-default peer-disabled:opacity-60">
                    <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
                    {label}
                  </span>
                </label>
              ))}
            </div>
            {species === "other" && (
              <Field data-invalid={!!errors.species}>
                <FieldLabel htmlFor="pet-species">Вид питомца</FieldLabel>
                <Input id="pet-species" name="customSpecies" placeholder="Например, кролик" maxLength={100} required aria-invalid={!!errors.species} aria-describedby={errors.species ? "pet-species-error" : undefined} />
                {errors.species && <FieldError id="pet-species-error">{errors.species}</FieldError>}
              </Field>
            )}
          </FieldSet>

          <Field data-invalid={!!errors.breed}>
            <FieldLabel htmlFor="pet-breed">Порода <span className="font-normal text-muted-foreground">(необязательно)</span></FieldLabel>
            <Input id="pet-breed" name="breed" placeholder="Например, британская короткошёрстная" maxLength={255} aria-invalid={!!errors.breed} aria-describedby={errors.breed ? "pet-breed-error" : undefined} />
            {errors.breed && <FieldError id="pet-breed-error">{errors.breed}</FieldError>}
          </Field>

          <Field data-invalid={!!errors.birth_date}>
            <FieldLabel htmlFor="pet-birth-date">Дата рождения <span className="font-normal text-muted-foreground">(необязательно)</span></FieldLabel>
            <Input id="pet-birth-date" name="birth_date" type="date" aria-invalid={!!errors.birth_date} aria-describedby={errors.birth_date ? "pet-birth-date-error pet-birth-date-help" : "pet-birth-date-help"} />
            <FieldDescription id="pet-birth-date-help">Если не знаете точную дату, оставьте поле пустым</FieldDescription>
            {errors.birth_date && <FieldError id="pet-birth-date-error">{errors.birth_date}</FieldError>}
          </Field>

          {errors.form && (
            <div className="flex flex-col gap-2">
              <FieldError>{errors.form}</FieldError>
              {needsLogin && <Link href="/" className="text-sm underline underline-offset-4">Войти в аккаунт</Link>}
            </div>
          )}

          <Field>
            <Button type="submit" disabled={pending} className="bg-secondary md:bg-primary">
              {pending && <Spinner />}
              {pending ? "Сохраняем…" : "Создать профиль питомца"}
            </Button>
          </Field>
        </FieldGroup>
      </FieldSet>
    </form>
  );
}
