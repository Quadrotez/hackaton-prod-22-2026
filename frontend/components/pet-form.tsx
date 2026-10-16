"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { createPet, getSpeciesOption, sexOptions, speciesOptions, updatePet, type Pet, type PetSex } from "@/lib/pets";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-state";
import { PetDeleteButton } from "@/components/pet-delete-button";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const ageModes = [
  { value: "birth_date", label: "Точно" },
  { value: "approximate", label: "Примерно" },
  { value: "unknown", label: "Не знаю" }
] as const;

type AgeMode = (typeof ageModes)[number]["value"];

const petSchema = z.object({
  name: z.string().trim().min(1, "Введите имя питомца").max(255, "Не больше 255 символов"),
  species: z.string().trim().min(1, "Укажите вид питомца").max(100, "Не больше 100 символов"),
  sex: z.enum(["boy", "girl"], { error: "Выберите пол питомца" }),
  breed: z.string().trim().max(255, "Не больше 255 символов"),
  weight: z.string().trim().min(1, "Укажите вес питомца")
    .transform((value) => Number(value.replace(",", ".")))
    .refine((kg) => Number.isFinite(kg) && kg > 0, "Укажите вес числом больше нуля")
    .refine((kg) => kg <= 1000, "Не больше 1000 кг")
    .transform((kg) => Math.max(1, Math.round(kg * 1000))),
  birth_date: z.union([z.literal(""), z.iso.date("Укажите корректную дату")])
    .refine((value) => !value || value <= today(), "Дата рождения не может быть в будущем"),
  approximate_age_years: z.string().trim()
    .refine((value) => !value || /^\d+$/.test(value), "Укажите целое число лет")
    .transform((value) => (value ? Number(value) : null))
    .refine((years) => years == null || years <= 100, "Не больше 100 лет"),
});

type FormErrors = Partial<Record<keyof z.infer<typeof petSchema>, string>>;

function initialAgeMode(pet?: Pet): AgeMode {
  if (!pet || pet.birth_date) return "birth_date";
  return pet.approximate_age_years != null ? "approximate" : "unknown";
}

function formatWeightKg(weightG: number): string {
  return String(weightG / 1000).replace(".", ",");
}

const choiceClass =
  "flex flex-col items-center gap-2 rounded-lg border border-input px-2 py-3 text-sm transition-colors hover:bg-secondary/40 peer-checked:border-foreground/40 peer-checked:bg-secondary peer-focus-visible:ring-2 peer-focus-visible:ring-foreground peer-disabled:cursor-default peer-disabled:opacity-60";

export function PetForm({ pet }: { pet?: Pet }) {
  const router = useRouter();
  const { authorized, handleAuthError } = useRequireAuth();
  const [species, setSpecies] = useState(pet ? getSpeciesOption(pet.species).value : "cat");
  const [sex, setSex] = useState<PetSex>(pet?.sex ?? "boy");
  const [ageMode, setAgeMode] = useState<AgeMode>(() => initialAgeMode(pet));
  const isEdit = pet !== undefined;
  const customSpeciesDefault = pet && getSpeciesOption(pet.species).value === "other" ? pet.species : undefined;
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const result = petSchema.safeParse({
      name: formData.get("name"),
      species: species === "other" ? formData.get("customSpecies") : species,
      sex,
      breed: formData.get("breed"),
      weight: formData.get("weight"),
      birth_date: ageMode === "birth_date" ? formData.get("birth_date") : "",
      approximate_age_years: ageMode === "approximate" ? formData.get("approximate_age_years") : "",
    });

    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof z.infer<typeof petSchema>;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      const firstField = result.error.issues[0]?.path[0];
      const fieldName = firstField === "species" ? "customSpecies" : firstField;
      const input = fieldName === "birth_date" ? form.querySelector("#pet-birth-date") : form.elements.namedItem(String(fieldName));
      if (input instanceof HTMLElement) input.focus();
      return;
    }

    setErrors({});
    setPending(true);
    try {
      const { weight, birth_date, approximate_age_years, ...rest } = result.data;
      const data = {
        ...rest,
        breed: rest.breed || null,
        weight_g: weight,
        birth_date: birth_date || null,
        approximate_age_years,
      };
      if (isEdit) {
        await updatePet(pet.id, data);
        toast.success("Изменения сохранены");
        router.replace(`/pet/${pet.id}`);
      } else {
        await createPet(data);
        router.replace("/me");
      }
    } catch (error) {
      if (!handleAuthError(error)) {
        const fallback = isEdit ? "Не удалось сохранить изменения" : "Не удалось добавить питомца";
        toast.error(getErrorMessage(error, `${fallback}. Попробуйте ещё раз`));
      }
    } finally {
      setPending(false);
    }
  }

  if (!authorized) return <PageLoading />;

  return (
    <>
      {isEdit ? (
        <PageHeader title="Редактировать питомца" backHref={`/pet/${pet.id}`} />
      ) : (
        <PageHeader title="Добавить питомца" />
      )}
      <Card>
        <form onSubmit={handleSubmit} noValidate aria-busy={pending}>
          <FieldSet disabled={pending}>
            <FieldGroup>
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="pet-name">Имя питомца</FieldLabel>
                <Input id="pet-name" name="name" defaultValue={pet?.name} placeholder="Например, Барсик" maxLength={255} required aria-invalid={!!errors.name} aria-describedby={errors.name ? "pet-name-error" : undefined} />
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
                      <span className={choiceClass}>
                        <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
                {species === "other" && (
                  <Field data-invalid={!!errors.species}>
                    <FieldLabel htmlFor="pet-species">Вид питомца</FieldLabel>
                    <Input id="pet-species" name="customSpecies" defaultValue={customSpeciesDefault} placeholder="Например, кролик" maxLength={100} required aria-invalid={!!errors.species} aria-describedby={errors.species ? "pet-species-error" : undefined} />
                    {errors.species && <FieldError id="pet-species-error">{errors.species}</FieldError>}
                  </Field>
                )}
              </FieldSet>

              <FieldSet className="gap-2">
                <FieldLegend variant="label">Пол питомца</FieldLegend>
                <div className="grid grid-cols-2 gap-2">
                  {sexOptions.map(({ value, label }) => (
                    <label key={value} className="relative cursor-pointer">
                      <input
                        type="radio"
                        name="sex"
                        value={value}
                        checked={sex === value}
                        onChange={() => {
                          setSex(value);
                          setErrors((current) => ({ ...current, sex: undefined }));
                        }}
                        className="peer sr-only"
                      />
                      <span className={choiceClass}>{label}</span>
                    </label>
                  ))}
                </div>
                {errors.sex && <FieldError>{errors.sex}</FieldError>}
              </FieldSet>

              <Field data-invalid={!!errors.breed}>
                <FieldLabel htmlFor="pet-breed">Порода <span className="font-normal text-muted-foreground">(необязательно)</span></FieldLabel>
                <Input id="pet-breed" name="breed" defaultValue={pet?.breed ?? undefined} placeholder="Например, британская короткошёрстная" maxLength={255} aria-invalid={!!errors.breed} aria-describedby={errors.breed ? "pet-breed-error" : undefined} />
                {errors.breed && <FieldError id="pet-breed-error">{errors.breed}</FieldError>}
              </Field>

              <Field data-invalid={!!errors.weight}>
                <FieldLabel htmlFor="pet-weight">Вес, кг</FieldLabel>
                <Input id="pet-weight" name="weight" defaultValue={pet?.weight_g != null ? formatWeightKg(pet.weight_g) : undefined} inputMode="decimal" placeholder="Например, 4,5" required aria-invalid={!!errors.weight} aria-describedby={errors.weight ? "pet-weight-error" : undefined} />
                {errors.weight && <FieldError id="pet-weight-error">{errors.weight}</FieldError>}
              </Field>

              <FieldSet className="gap-2">
                <FieldLegend variant="label">Возраст <span className="font-normal text-muted-foreground">(необязательно)</span></FieldLegend>
                <div className="grid grid-cols-3 gap-2">
                  {ageModes.map(({ value, label }) => (
                    <label key={value} className="relative cursor-pointer">
                      <input
                        type="radio"
                        name="age_mode"
                        value={value}
                        checked={ageMode === value}
                        onChange={() => {
                          setAgeMode(value);
                          setErrors((current) => ({ ...current, birth_date: undefined, approximate_age_years: undefined }));
                        }}
                        className="peer sr-only"
                      />
                      <span className={choiceClass}>{label}</span>
                    </label>
                  ))}
                </div>
                {ageMode === "birth_date" && (
                  <Field data-invalid={!!errors.birth_date}>
                    <FieldLabel htmlFor="pet-birth-date" className="sr-only">Дата рождения</FieldLabel>
                    <DatePicker id="pet-birth-date" name="birth_date" disableFuture defaultValue={pet?.birth_date ?? undefined} aria-invalid={!!errors.birth_date} aria-describedby={errors.birth_date ? "pet-birth-date-error" : undefined} />
                    {errors.birth_date && <FieldError id="pet-birth-date-error">{errors.birth_date}</FieldError>}
                  </Field>
                )}
                {ageMode === "approximate" && (
                  <Field data-invalid={!!errors.approximate_age_years}>
                    <FieldLabel htmlFor="pet-approximate-age" className="sr-only">Примерный возраст, лет</FieldLabel>
                    <Input id="pet-approximate-age" name="approximate_age_years" type="number" defaultValue={pet?.approximate_age_years ?? undefined} inputMode="numeric" min={0} max={100} step={1} placeholder="Сколько полных лет" aria-invalid={!!errors.approximate_age_years} aria-describedby={errors.approximate_age_years ? "pet-approximate-age-error" : undefined} />
                    {errors.approximate_age_years && <FieldError id="pet-approximate-age-error">{errors.approximate_age_years}</FieldError>}
                  </Field>
                )}
              </FieldSet>

              <Field>
                <Button type="submit" disabled={pending}>
                  {pending && <Spinner />}
                  {isEdit ? "Сохранить изменения" : "Добавить питомца"}
                </Button>
              </Field>

              {isEdit && (
                <Field>
                  <PetDeleteButton pet={pet} />
                </Field>
              )}
            </FieldGroup>
          </FieldSet>
        </form>
      </Card>
    </>
  );
}
