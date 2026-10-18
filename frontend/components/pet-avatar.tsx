"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { getSpeciesOption, petPhotoPath, type Pet } from "@/lib/pets";
import { useProtectedImage } from "@/hooks/use-protected-image";

const sizes = {
  xs: { box: "size-8", icon: "size-4", px: 32 },
  sm: { box: "size-12", icon: "size-5", px: 48 },
  md: { box: "size-16", icon: "size-7", px: 64 },
  lg: { box: "size-20", icon: "size-8", px: 80 },
};

export function PetAvatar({
  pet,
  size = "sm",
  className,
}: {
  pet: Pick<Pet, "id" | "name" | "species" | "photo_url">;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const { box, icon, px } = sizes[size];
  const photoUrl = useProtectedImage(petPhotoPath(pet.id), pet.photo_url);

  if (photoUrl) {
    return (
      <span className={cn(box, "relative block min-h-0 min-w-0 shrink-0 overflow-hidden rounded-full bg-secondary", className)}>
        <Image
          unoptimized
          fill
          sizes={`${px}px`}
          src={photoUrl}
          alt={pet.name}
          className="object-cover"
        />
      </span>
    );
  }

  const Icon = getSpeciesOption(pet.species).icon;
  return (
    <div className={cn(box, "flex shrink-0 items-center justify-center rounded-full bg-secondary", className)}>
      <Icon aria-hidden="true" className={icon} strokeWidth={1.5} />
    </div>
  );
}
