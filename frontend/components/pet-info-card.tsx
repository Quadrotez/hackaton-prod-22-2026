import Link from "next/link";
import { PencilIcon } from "lucide-react";
import { formatPetSummary, isCaretaker, uploadPetPhoto, type Pet } from "@/lib/pets";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PetAvatar } from "@/components/pet-avatar";
import { PhotoUploadButton } from "@/components/photo-upload-button";

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("ru-RU");
}

export function PetInfoCard({ pet, onPetChange }: { pet: Pet; onPetChange: (pet: Pet) => void }) {
  // A temporary caretaker sees the profile but cannot change it.
  const editable = !isCaretaker(pet);
  return (
    <Card className="relative flex items-center gap-4">
      <div className="relative shrink-0">
        <PetAvatar pet={pet} size="lg" />
        {editable && (
          <PhotoUploadButton
            hasPhoto={Boolean(pet.photo_url)}
            upload={async (file) => onPetChange(await uploadPetPhoto(pet.id, file))}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-8">
        <p className="font-medium">{formatPetSummary(pet)}</p>
        {!editable && <p className="text-xs text-muted-foreground">Под присмотром · профиль изменяет владелец</p>}
        {pet.birth_date && (
          <p className="text-sm text-muted-foreground">Дата рождения: {formatDate(pet.birth_date)}</p>
        )}
      </div>
      {editable && <Link
        href={`/pet/${pet.id}/edit`}
        aria-label="Редактировать питомца"
        title="Редактировать"
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "absolute right-3 top-3 text-muted-foreground")}
      >
        <PencilIcon aria-hidden="true" className="size-4" />
      </Link>}
    </Card>
  );
}
