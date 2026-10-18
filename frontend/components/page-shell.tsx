import Link from "next/link";
import { BackgroundArt } from "@/components/background-art";
import { Logo } from "@/components/logo";
import { PetMenu } from "@/components/pet-menu";
import { Menu } from "@/components/menu";

export function PageShell({ children, contentClassName = "max-w-sm md:max-w-xl" }: {
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center bg-background px-6 pb-28 pt-20">
      <div className="contents print:hidden"><BackgroundArt /></div>
      <Link
        href="/me"
        className="absolute left-6 top-6 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      >
        <Logo />
      </Link>
      <div className="absolute right-6 top-5 z-30 print:hidden"><PetMenu /></div>
      <div className={`flex w-full flex-col gap-6 ${contentClassName}`}>{children}</div>
      <div className="contents print:hidden"><Menu /></div>
    </main>
  );
}
