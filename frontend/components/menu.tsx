"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, PlusIcon, LogOutIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { clearAccessToken } from "@/lib/auth";
import { useRouter } from "next/navigation";

const itemClass =
  "flex items-center justify-center p-2 rounded-xl duration-200 hover:bg-black/5";

function MenuLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(itemClass, active && "bg-black/10")}
    >
      <Icon />
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
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={itemClass}
    >
      <Icon />
    </button>
  );
}

export function Menu() {
  const router = useRouter();

  function handleLogout() {
    clearAccessToken();
    router.push("/");
  }

  return (
    <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-row gap-1 rounded-xl bg-white p-2">
      <MenuLink href="/me" label="Главная" icon={HomeIcon} />
      <MenuLink href="/pet/create" label="Создать питомца" icon={PlusIcon} />
      <MenuAction onClick={handleLogout} label="Выйти" icon={LogOutIcon} />
    </nav>
  );
}