"use client";

import Link from "next/link";
import { BugIcon, PillIcon, PlusIcon, StethoscopeIcon, SyringeIcon, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isCaretaker, type Pet } from "@/lib/pets";

const options: { section: "visits" | "vaccines" | "medicines" | "parasites"; label: string; icon: LucideIcon }[] = [
  { section: "visits", label: "Приём", icon: StethoscopeIcon },
  { section: "vaccines", label: "Прививка", icon: SyringeIcon },
  { section: "medicines", label: "Лекарство", icon: PillIcon },
  { section: "parasites", label: "Обработка", icon: BugIcon },
];

const href = (pet: Pet, section: string) => `/pet/${pet.id}/health/${section}?add=1`;
// A temporary caretaker can add visits but not change the pet's treatment plan.
const canAdd = (pet: Pet, section: string) => section === "visits" || !isCaretaker(pet);

export function QuickAddMenu({ pets }: { pets: Pet[] }) {
  const available = options
    .map((option) => ({ ...option, pets: pets.filter((pet) => canAdd(pet, option.section)) }))
    .filter((option) => option.pets.length > 0);
  if (available.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Добавить событие"
        className={buttonVariants({ variant: "secondary", size: "icon", className: "size-10 rounded-xl" })}
      >
        <PlusIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-40">
        {available.map(({ section, label, icon: Icon, pets }) =>
          pets.length === 1 ? (
            <DropdownMenuItem key={section} render={<Link href={href(pets[0], section)} />}>
              <Icon aria-hidden="true" />
              {label}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub key={section}>
              <DropdownMenuSubTrigger>
                <Icon aria-hidden="true" />
                {label}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {pets.map((pet) => (
                  <DropdownMenuItem key={pet.id} render={<Link href={href(pet, section)} />}>
                    {pet.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
