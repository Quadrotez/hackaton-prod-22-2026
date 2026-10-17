"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HomeIcon, CalendarIcon, LogOutIcon, type LucideIcon, UtensilsIcon, UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { clearAccessToken } from "@/lib/session";

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

function MenuAction({
  onClick,
  label,
  icon: Icon,
}: {
  onClick: () => void;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <Button type="button" variant="ghost" onClick={onClick} aria-label={label} title={label} className={itemClass}>
      <Icon aria-hidden="true" />
      <span className={labelClass}>{label}</span>
    </Button>
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
  const router = useRouter();

  function handleLogout() {
    clearAccessToken();
    router.push("/");
  }

  return (
    <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-row gap-1 rounded-xl bg-white border-2 border-secondary p-2">
      <MenuLink href="/me" label="Мои питомцы" btname="Питомцы" icon={HomeIcon} active={pathname === "/me"} />
      <MenuLink href="/food" label="Корм" icon={UtensilsIcon} active={pathname === "/food"} />
      <MenuLink href="/calendar" label="Календарь" icon={CalendarIcon} active={pathname === "/calendar"} />
      <MenuLink href="/account" label="Аккаунт" icon={UserIcon} active={pathname === "/account"} />
      <MenuAction onClick={handleLogout} label="Выйти" icon={LogOutIcon} />
    </nav>
  );
}
