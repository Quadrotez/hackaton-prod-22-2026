import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="PetCare"
      width={96}
      height={32}
      priority
      className={cn("h-8 w-auto", className)}
    />
  );
}
