import Image from "next/image";
import { cn } from "@/lib/utils";

// Логотип — чёрный на белом: в тёмной теме инвертируем, а белый фон растворяем в тёмном.
export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="PetCare"
      width={96}
      height={32}
      priority
      className={cn("h-8 w-auto dark:invert dark:mix-blend-screen", className)}
    />
  );
}
