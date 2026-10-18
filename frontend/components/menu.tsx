"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { HomeIcon, type LucideIcon, PackageIcon, PawPrintIcon, UserIcon, UtensilsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { PetAvatar } from "@/components/pet-avatar";
import { useActivePet } from "@/components/active-pet-provider";
import { petIdFromPath } from "@/lib/active-pet";
import { isCaretaker } from "@/lib/pets";

const itemClass = cn(buttonVariants({ variant: "ghost" }), "size-10 rounded-xl p-0 md:h-14 md:w-16 md:flex-col md:gap-1 [&_svg:not([class*='size-'])]:size-5");
const labelClass = "hidden text-[11px] font-medium leading-3 md:block";

function MenuLink({
  btname,
  href,
  label,
  icon: Icon,
  active,
}: {
  btname?: string;
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
      className={cn(itemClass, active && "bg-muted")}
    >
      <Icon aria-hidden="true" />
      <span className={labelClass}>{btname ?? label}</span>
    </Link>
  );
}

export function Menu() {
  return (
    <Suspense fallback={<MenuBar />}>
      <MenuWithPathname />
    </Suspense>
  );
}

function MenuWithPathname() {
  const pathname = usePathname();
  const feeding = useSearchParams().get("feed") === "1";
  return <MenuBar pathname={pathname} feeding={feeding} />;
}

function MenuBar({ pathname = "", feeding = false }: { pathname?: string; feeding?: boolean }) {
  const { activePet, pets, status } = useActivePet();
  const pet = pets.find((item) => item.id === petIdFromPath(pathname)) ?? activePet;

  const onPetPage = !!pet && pathname === `/pet/${pet.id}`;
  const feedActive = onPetPage && feeding;
  const profileActive = onPetPage && !feeding;
  const stockActive = pathname === "/food";

  return (
    <nav aria-label="Основная навигация" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 flex-row items-center gap-1 rounded-2xl border-2 border-secondary bg-card p-2 shadow-lg shadow-foreground/5 dark:shadow-black/40">
      <MenuLink href="/me" label="Главная" icon={HomeIcon} active={pathname === "/me"} />
      {pet && status === "ready" ? (
        <MenuLink
          href={`/pet/${pet.id}?feed=1#feeding`}
          label={`Покормить: ${pet.name}`}
          btname="Покормить"
          icon={UtensilsIcon}
          active={feedActive}
        />
      ) : (
        <button type="button" disabled aria-label="Покормить" title={status === "loading" ? "Загружаем питомцев…" : "Сначала выберите питомца"} className={itemClass}>
          <UtensilsIcon aria-hidden="true" /><span className={labelClass}>Покормить</span>
        </button>
      )}
      <Link
        href={pet ? `/pet/${pet.id}` : "/pet/create"}
        aria-label={pet ? `Профиль питомца: ${pet.name}` : "Добавить питомца"}
        aria-current={profileActive ? "page" : undefined}
        title={pet ? `Профиль: ${pet.name}` : "Добавить питомца"}
        className="relative -mt-6 flex w-16 shrink-0 flex-col items-center gap-1 rounded-2xl px-1 pb-1 outline-none focus-visible:ring-2 focus-visible:ring-foreground md:w-20"
      >
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-full border-4 border-card bg-primary shadow-sm ring-1 ring-border dark:text-primary-foreground",
            profileActive && "ring-2 ring-foreground",
            pet && isCaretaker(pet) && "ring-0",
          )}
        >
          {pet ? <PetAvatar pet={pet} size="sm" className="size-full bg-primary" /> : <PawPrintIcon aria-hidden="true" className="size-6" />}
        </span>
        <span className="text-[11px] font-semibold leading-3">{pet && isCaretaker(pet) ? "Присматриваю" : "Профиль"}</span>
      </Link>
      <MenuLink href="/food" label="Запасы" icon={PackageIcon} active={stockActive} />
      <MenuLink href="/account" label="Аккаунт" icon={UserIcon} active={pathname === "/account"} />
    </nav>
  );
}
