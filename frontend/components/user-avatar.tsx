"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { AVATAR_PATH, type UserPublic } from "@/lib/auth";
import { useProtectedImage } from "@/hooks/use-protected-image";

function getInitials(user: Pick<UserPublic, "name" | "email">): string {
  const words = user.name?.trim().split(/\s+/).filter(Boolean) ?? [];
  const letters = words.length > 0 ? words.slice(0, 2).map((word) => word[0]) : [user.email[0]];
  return letters.join("").toUpperCase();
}

export function UserAvatar({ user, className }: { user: UserPublic; className?: string }) {
  const photoUrl = useProtectedImage(AVATAR_PATH, user.avatar_url ?? null);

  if (photoUrl) {
    return (
      <Image
        unoptimized
        width={96}
        height={96}
        src={photoUrl}
        alt={user.name ?? user.email}
        className={cn("size-24 shrink-0 rounded-full bg-secondary object-cover", className)}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex size-24 shrink-0 items-center justify-center rounded-full bg-linear-135 from-primary to-secondary text-3xl font-semibold tracking-tight",
        className,
      )}
    >
      {getInitials(user)}
    </div>
  );
}
