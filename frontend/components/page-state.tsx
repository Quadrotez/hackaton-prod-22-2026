import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export function PageLoading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner className="size-6" />
    </div>
  );
}

export function PageError({
  title = "Кажется, что-то пошло не так",
  message,
  onRetry,
  backToList,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  backToList?: boolean;
}) {
  return (
    <Card role="alert" className="flex flex-col items-center gap-4 py-8 text-center">
      <span
        aria-hidden="true"
        className="size-12 bg-muted-foreground/60 [mask:url(/logo-mark.png)_center/contain_no-repeat]"
      />
      <div className="flex flex-col gap-1 text-muted-foreground">
        <p className="font-medium">{title}</p>
        <p className="text-sm">{message}</p>
      </div>
      <div className="flex items-center gap-4">
        {onRetry && (
          <Button type="button" variant="secondary" onClick={onRetry}>
            Ещё раз
          </Button>
        )}
        {backToList && (
          <Link href="/me" className="text-sm text-muted-foreground underline underline-offset-4">
            К моим питомцам
          </Link>
        )}
      </div>
    </Card>
  );
}
