import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatPetSummary, type Pet } from "@/lib/pets";
import { cardVariants } from "@/components/ui/card";
import { PetAvatar } from "@/components/pet-avatar";

export function PetCard({ pet }: { pet: Pet }) {
  return (
    <Link
      href={`/pet/${pet.id}`}
      className={cn(
        cardVariants(),
        "flex items-center gap-4 outline-none transition-colors hover:bg-card/70 focus-visible:ring-2 focus-visible:ring-foreground",
      )}
    >
      <PetAvatar pet={pet} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="truncate">{pet.name}</h2>
        <p className="truncate text-sm text-muted-foreground">{formatPetSummary(pet)}</p>
      </div>
      <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
