"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense } from "react";
import { Popover } from "@base-ui/react/popover";
import { ArrowRightIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, LoaderCircleIcon, PawPrintIcon, PlusIcon } from "lucide-react";
import { useActivePet } from "@/components/active-pet-provider";
import { petIdFromPath, petSwitchHref } from "@/lib/active-pet";
import { isCaretaker } from "@/lib/pets";
import { cn } from "@/lib/utils";
import { PetAvatar } from "@/components/pet-avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import "@/components/pet-menu.css";

const PAGE_SIZE = 3;

export function PetMenu() {
  return <Suspense fallback={null}><PetMenuWithPath /></Suspense>;
}

function PetMenuWithPath() {
  const pathname = usePathname();
  const router = useRouter();
  const { pets, activePet, status, error, selectPet, refreshPets } = useActivePet();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [group, setGroup] = useState<"owner" | "caretaker" | null>(null);
  const selectedGroup = group ?? (activePet && isCaretaker(activePet) ? "caretaker" : "owner");
  const ownPets = pets.filter((pet) => !isCaretaker(pet));
  const carePets = pets.filter(isCaretaker);
  const groupPets = selectedGroup === "caretaker" ? carePets : ownPets;
  const pageCount = Math.ceil(groupPets.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const visiblePets = groupPets.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      const nextGroup = activePet && isCaretaker(activePet) ? "caretaker" : "owner";
      setGroup(nextGroup);
      const index = (nextGroup === "caretaker" ? carePets : ownPets).findIndex((pet) => pet.id === activePet?.id);
      setPage(index < 0 ? 0 : Math.floor(index / PAGE_SIZE));
      void refreshPets();
    }
    setOpen(nextOpen);
  }

  function choosePet(petId: number) {
    selectPet(petId);
    setOpen(false);
    const routeId = petIdFromPath(pathname ?? "");
    if (pathname && routeId !== null && routeId !== petId) {
      const feeding = new URLSearchParams(window.location.search).get("feed") === "1";
      router.push(petSwitchHref(pathname, petId, feeding), { scroll: false });
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger
        aria-label={activePet ? `Сменить активного питомца: ${activePet.name}` : "Выбрать активного питомца"}
        title={activePet ? `Активный питомец: ${activePet.name}` : "Выбрать питомца"}
        className={cn("pet-menu-trigger", "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground")}
        data-active={Boolean(activePet) || undefined}
      >
        <span className="pet-menu-paw">
          {activePet ? <PetAvatar key={activePet.id} pet={activePet} size="sm" className="pet-menu-currentAvatar" /> : <PawPrintIcon aria-hidden="true" className="size-6" strokeWidth={1.6} />}
          {pets.length > 0 && <span className="pet-menu-count">{pets.length}</span>}
        </span>
        <span aria-live="polite" className="pet-menu-triggerLabel"><span className="block text-[10px] font-normal text-muted-foreground">{activePet && isCaretaker(activePet) ? "Присматриваю" : "Мой питомец"}</span>{activePet?.name ?? "Выбрать"}</span>
        <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" sideOffset={10} collisionPadding={16} className="z-50">
          <Popover.Popup className="pet-menu-popup">
            <div className="pet-menu-header">
              <Popover.Title className="text-sm font-medium">
                Активный питомец
                <span className="ml-2 font-normal text-muted-foreground">{pets.length || ""}</span>
              </Popover.Title>
              {pageCount > 1 && status === "ready" && (
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="pet-menu-pageButton" aria-label="Предыдущие питомцы" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeftIcon aria-hidden="true" /></Button>
                  <Button variant="ghost" size="icon" className="pet-menu-pageButton" aria-label="Следующие питомцы" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><ChevronRightIcon aria-hidden="true" /></Button>
                </div>
              )}
            </div>
            {pets.length > 0 && status === "ready" && <div aria-label="Группа питомцев" className="my-2 grid grid-cols-2 gap-1 rounded-xl bg-secondary/40 p-1">
              {([{ value: "owner", label: "Мои", count: ownPets.length }, { value: "caretaker", label: "Присматриваю", count: carePets.length }] as const).map((item) => <button key={item.value} type="button" aria-pressed={selectedGroup === item.value} onClick={() => { setGroup(item.value); setPage(0); }} className={cn("min-h-10 rounded-lg px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-foreground", selectedGroup === item.value ? "bg-card text-foreground" : "text-muted-foreground hover:bg-card/60")}>
                {item.label} · {item.count}
              </button>)}
            </div>}
            {status === "loading" ? (
              <div role="status" className="pet-menu-message"><LoaderCircleIcon aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /><span>Загружаем питомцев…</span></div>
            ) : status === "error" ? (
              <div className="pet-menu-message"><p role="alert">{error}</p><Button variant="secondary" onClick={() => { void refreshPets(); }}>Повторить</Button></div>
            ) : pets.length === 0 ? (
              <div className="pet-menu-message">
                <p>Добавьте своего первого питомца</p>
                <Link href="/pet/create" className={buttonVariants()} onNavigate={() => setOpen(false)}><PlusIcon aria-hidden="true" /> Добавить питомца</Link>
              </div>
            ) : groupPets.length === 0 ? <div className="pet-menu-message"><p>{selectedGroup === "owner" ? "Своих питомцев пока нет" : "Питомцев под присмотром пока нет"}</p>{selectedGroup === "caretaker" && <Link href="/transfers" onNavigate={() => setOpen(false)} className="underline underline-offset-4">Открыть приглашения</Link>}</div> : (
              <ul key={`${selectedGroup}-${currentPage}`} aria-label={`${selectedGroup === "caretaker" ? "Под присмотром" : "Мои питомцы"}, страница ${currentPage + 1} из ${pageCount}`} className="pet-menu-fan">
                {visiblePets.map((pet) => (
                  <li key={pet.id} className="pet-menu-pet">
                    <button type="button" aria-label={`Выбрать питомца: ${pet.name}${isCaretaker(pet) ? " (у вас на время)" : ""}`} aria-pressed={pet.id === activePet?.id} onClick={() => choosePet(pet.id)} className="pet-menu-petLink">
                      <PetAvatar pet={pet} size="md" className="pet-menu-avatar" />
                      <span className="pet-menu-petName" title={pet.name}>{pet.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pageCount > 1 && status === "ready" && <p aria-live="polite" className="pet-menu-pageLabel">{currentPage + 1} / {pageCount}</p>}
            {pets.length > 0 && status === "ready" && <Link href="/pet/create" onNavigate={() => setOpen(false)} className={buttonVariants({ variant: "secondary", className: "mt-2 w-full" })}><PlusIcon aria-hidden="true" />Добавить питомца</Link>}
            {activePet && status === "ready" && <Link href={`/pet/${activePet.id}`} onNavigate={() => setOpen(false)} className="pet-menu-profileLink">
              <span className="min-w-0"><span className="block truncate font-medium">Профиль питомца: {activePet.name}</span><span className="mt-1 block text-xs">Здоровье, прививки и измерения</span></span><ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
            </Link>}
            <Popover.Arrow className="pet-menu-arrow" />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
