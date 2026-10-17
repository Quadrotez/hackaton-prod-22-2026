import Link from "next/link";
import { Logo } from "@/components/logo";
import { Menu } from "@/components/menu";

export function PageShell({ children, contentClassName = "max-w-sm" }: {
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center bg-secondary px-6 pb-28 pt-20">
      <Link
        href="/me"
        className="absolute left-6 top-6 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      >
        <Logo />
      </Link>
      <div className={`flex w-full flex-col gap-6 ${contentClassName}`}>{children}</div>
      <Menu />
    </main>
  );
}
