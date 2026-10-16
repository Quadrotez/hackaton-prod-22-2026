"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { deletePet, type Pet } from "@/lib/pets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function PetDeleteButton({ pet }: { pet: Pick<Pet, "id" | "name"> }) {
  const router = useRouter();
  const { handleAuthError } = useRequireAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    try {
      await deletePet(pet.id);
      toast.success(`Питомец «${pet.name}» удалён`);
      router.replace("/me");
    } catch (error) {
      setOpen(false);
      if (!handleAuthError(error)) {
        toast.error(getErrorMessage(error, "Не удалось удалить питомца. Попробуйте ещё раз"));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger render={<Button type="button" variant="secondary" className="theme-shadcn h-9 w-full" />}>
        <Trash2Icon aria-hidden="true" />
        Удалить питомца
      </AlertDialogTrigger>
      <AlertDialogContent className="theme-shadcn">
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить питомца «{pet.name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Профиль, фото и вся история кормлений будут удалены. Восстановить их не получится.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={handleDelete}>
            {pending && <Spinner />}
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
