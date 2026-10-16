"use client";

import { useState, type ChangeEvent } from "react";
import { CameraIcon } from "lucide-react";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/photos";
import { Spinner } from "@/components/ui/spinner";

export function PhotoUploadButton({
  hasPhoto,
  upload,
}: {
  hasPhoto: boolean;
  upload: (file: File) => Promise<void>;
}) {
  const { handleAuthError } = useRequireAuth();
  const [pending, setPending] = useState(false);
  const label = hasPhoto ? "Изменить фото" : "Загрузить фото";

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    if (!PHOTO_TYPES.includes(file.type)) {
      toast.error("Неподдерживаемый формат. Загрузите PNG, JPEG, GIF или WebP");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      toast.error("Файл слишком большой. Максимум 5 МБ");
      return;
    }

    setPending(true);
    try {
      await upload(file);
      toast.success("Фото обновлено");
    } catch (error) {
      if (!handleAuthError(error)) {
        toast.error(getErrorMessage(error, "Не удалось загрузить фото. Попробуйте ещё раз"));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <label
      title={label}
      className="absolute -bottom-1 -right-1 flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-card bg-secondary text-primary-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_8%)] has-focus-visible:ring-2 has-focus-visible:ring-foreground has-disabled:cursor-default"
    >
      <input
        type="file"
        accept={PHOTO_TYPES.join(",")}
        aria-label={label}
        disabled={pending}
        onChange={handleChange}
        className="sr-only"
      />
      {pending ? <Spinner className="size-3.5" /> : <CameraIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />}
    </label>
  );
}
