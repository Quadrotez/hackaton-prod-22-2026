"use client";

import Link from "next/link";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function TransferLink({ transferId }: { transferId: number }) {
  const href = `/transfers/${transferId}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
      toast.success("Ссылка на заявку скопирована");
    } catch {
      toast.error("Не удалось скопировать ссылку. Откройте заявку и скопируйте адрес из браузера");
    }
  }

  return <div className="flex flex-wrap items-center gap-3">
    <Link href={href} className="text-sm underline underline-offset-4">Открыть заявку</Link>
    <Button type="button" size="sm" variant="ghost" onClick={copyLink}><CopyIcon aria-hidden="true" className="size-4" />Скопировать ссылку</Button>
  </div>;
}
