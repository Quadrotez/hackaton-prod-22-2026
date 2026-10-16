import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function PageHeader({
  title,
  description,
  backHref,
}: {
  title: string;
  description?: string;
  backHref?: string;
}) {
  return (
    <header className="flex items-center gap-4">
      {backHref && (
        <Link
          href={backHref}
          aria-label="Назад"
          className={cn(buttonVariants({ variant: "outline" }), "size-10 shrink-0 rounded-xl bg-card p-0 [&_svg:not([class*='size-'])]:size-5")}
        >
          <ChevronLeftIcon aria-hidden="true" className="size-5" />
        </Link>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
    </header>
  );
}
