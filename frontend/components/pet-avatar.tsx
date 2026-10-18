"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { getSpeciesOption, petPhotoPath, type Pet } from "@/lib/pets";
import { birthdayOnDate, birthdayTitle } from "@/lib/birthdays";
import { useProtectedImage } from "@/hooks/use-protected-image";

const sizes = {
  xs: { box: "size-8", icon: "size-4", px: 32 },
  sm: { box: "size-12", icon: "size-5", px: 48 },
  md: { box: "size-16", icon: "size-7", px: 64 },
  lg: { box: "size-20", icon: "size-8", px: 80 },
};

function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function subscribeToDay(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

const serverDay = () => null;

export function PetAvatar({
  pet,
  size = "sm",
  className,
}: {
  pet: Pick<Pet, "id" | "name" | "species" | "photo_url"> & Partial<Pick<Pet, "birth_date">>;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const { box, icon, px } = sizes[size];
  const photoUrl = useProtectedImage(petPhotoPath(pet.id), pet.photo_url);
  const today = useSyncExternalStore(subscribeToDay, localDay, serverDay);
  const birthday = pet.birth_date && today ? birthdayOnDate(pet.birth_date, today) : null;
  const Icon = getSpeciesOption(pet.species).icon;
  return (
    <span
      title={birthday ? `${pet.name} — ${birthdayTitle(birthday.age)}` : undefined}
      className={cn(box, "relative isolate block min-h-0 min-w-0 shrink-0 rounded-full bg-secondary", className)}
    >
      <span className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[inherit]">
        {photoUrl ? (
          <Image unoptimized fill sizes={`${px}px`} src={photoUrl} alt={pet.name} className="object-cover" />
        ) : (
          <Icon data-pet-avatar-icon aria-hidden="true" className={icon} strokeWidth={1.5} />
        )}
      </span>
      {birthday && <>
        <svg aria-hidden="true" viewBox="0 0 56 60" className="pointer-events-none absolute -top-[34%] left-[18%] z-10 h-auto w-[64%] origin-[50%_90%] -rotate-8 overflow-visible drop-shadow-[0_1px_1px_rgba(43,45,31,0.12)]">
          <path d="M4 52 25 9q3-5 6 0l21 43q-24 9-48 0Z" fill="#e98b83" />
          <path d="m29 9 23 43q-8 3-15 4Z" fill="#d77570" />
          <circle cx="26" cy="23" r="2.5" fill="#fff8e8" />
          <circle cx="17" cy="38" r="3" fill="#fff8e8" />
          <circle cx="35" cy="42" r="3" fill="#fff8e8" />
          <path d="M4 52q24 9 48 0" fill="none" stroke="#fff8e8" strokeWidth="6" strokeLinecap="round" />
          <circle cx="28" cy="7" r="5.5" fill="#fff8e8" />
        </svg>
        <span className="sr-only">{birthdayTitle(birthday.age)}</span>
      </>}
    </span>
  );
}
