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
  message,
  onRetry,
  backToList,
}: {
  message: string;
  onRetry?: () => void;
  // Ссылка на список питомцев — для страниц, откуда есть куда вернуться
  backToList?: boolean;
}) {
  return (
    <Card role="alert" className="flex flex-col items-start gap-4">
      <p className="text-destructive">{message}</p>
      <div className="flex items-center gap-4">
        {onRetry && (
          <Button type="button" onClick={onRetry}>
            Попробовать снова
          </Button>
        )}
        {backToList && (
          <Link href="/me" className="text-sm underline underline-offset-4">
            К моим питомцам
          </Link>
        )}
      </div>
    </Card>
  );
}
