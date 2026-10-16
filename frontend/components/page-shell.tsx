import Link from "next/link";
import { logoClass } from "@/components/logo";
import { Menu } from "@/components/menu";

// Каркас внутренних страниц: единые отступы и ширина контента
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center bg-secondary px-6 pb-28 pt-20">
      <Link
        href="/me"
        className={`${logoClass} absolute left-6 top-6 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground`}
      >
        PetCare
      </Link>
      <div className="flex w-full max-w-sm flex-col gap-6">{children}</div>
      <Menu />
    </main>
  );
}
