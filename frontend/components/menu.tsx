"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, CalendarIcon, type LucideIcon, UtensilsIcon, UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const itemClass = cn(buttonVariants({ variant: "ghost" }), "size-10 rounded-xl p-0 [&_svg:not([class*='size-'])]:size-5");

function MenuLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(itemClass, active && "bg-muted")}
    >
      <Icon />
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
  return <MenuBar pathname={usePathname()} />;
}

function MenuBar({ pathname }: { pathname?: string }) {
  return (
    <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-row gap-1 rounded-xl bg-white border-2 border-secondary p-2">
      <MenuLink href="/me" label="Мои питомцы" icon={HomeIcon} active={pathname === "/me"} />
      <MenuLink href="/food" label="Корм" icon={UtensilsIcon} active={pathname === "/food"} />
      <MenuLink href="/account" label="Аккаунт" icon={UserIcon} active={pathname === "/account"} />
    </nav>
  );
}
