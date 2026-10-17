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
          className={cn(
            buttonVariants({ variant: "secondary", size: "icon-lg" }),
            "theme-shadcn shrink-0 hover:bg-background",
          )}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Link>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
    </header>
  );
}
