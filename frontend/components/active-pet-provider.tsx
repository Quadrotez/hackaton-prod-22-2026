"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { ApiError, getErrorMessage } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { petIdFromPath, readActivePetId, rememberActivePet } from "@/lib/active-pet";
import { listPets, PETS_CHANGED_EVENT, type Pet } from "@/lib/pets";
import { clearAccessToken, getAccessToken, subscribeToAccessToken } from "@/lib/session";

type PetSnapshot = { userId: number; pets: Pet[]; selectedId: number | null };
type ActivePetContextValue = {
  pets: Pet[];
  activePet: Pet | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  selectPet: (petId: number) => void;
  refreshPets: () => Promise<void>;
};
const ActivePetContext = createContext<ActivePetContextValue | null>(null);
const NO_PETS: Pet[] = [];

export function useActivePet() {
  const context = useContext(ActivePetContext);
  if (!context) throw new Error("useActivePet requires ActivePetProvider");
  return context;
}

export function ActivePetProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(subscribeToAccessToken, getAccessToken, () => undefined);
  // Account changes discard in-memory pets; saved preferences are scoped to the user ID.
  return <PetSessionProvider key={token ?? "guest"} authorized={Boolean(token)}>{children}</PetSessionProvider>;
}

function PetSessionProvider({ authorized, children }: { authorized: boolean; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<PetSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedId = useRef<number | null>(null);
  const requests = useRef({ version: 0 });
  const userId = useRef<number | null>(null);
  const pets = snapshot?.pets ?? NO_PETS;
  const ownerId = snapshot?.userId;

  const refreshPets = useCallback(async () => {
    if (!authorized) return;
    const request = ++requests.current.version;
    try {
      const [nextPets, user] = await Promise.all([
        listPets(),
        userId.current === null ? getMe() : Promise.resolve({ id: userId.current }),
      ]);
      if (request !== requests.current.version) return;
      userId.current = user.id;
      const candidates = [petIdFromPath(window.location.pathname), selectedId.current, readActivePetId(user.id)];
      const nextId = candidates.find((id) => nextPets.some((pet) => pet.id === id)) ?? nextPets[0]?.id ?? null;
      selectedId.current = nextId;
      rememberActivePet(user.id, nextId);
      setSnapshot({ userId: user.id, pets: nextPets, selectedId: nextId });
      setError(null);
    } catch (cause) {
      if (request !== requests.current.version) return;
      if (cause instanceof ApiError && cause.status === 401) {
        if (getAccessToken()) { toast.error(cause.message); clearAccessToken(); }
      } else {
        setError(getErrorMessage(cause, "Не удалось загрузить питомцев"));
      }
    }
  }, [authorized]);

  const selectPet = useCallback((petId: number) => {
    if (ownerId === undefined || !pets.some((pet) => pet.id === petId)) return;
    selectedId.current = petId;
    rememberActivePet(ownerId, petId);
    setSnapshot((current) => current && current.selectedId !== petId ? { ...current, selectedId: petId } : current);
  }, [pets, ownerId]);

  useEffect(() => {
    const pending = requests.current;
    const refresh = () => { void refreshPets(); };
    window.addEventListener(PETS_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      ++pending.version;
      window.removeEventListener(PETS_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshPets]);

  return <ActivePetContext.Provider value={{
    pets,
    activePet: pets.find((pet) => pet.id === snapshot?.selectedId) ?? null,
    status: error ? "error" : snapshot || !authorized ? "ready" : "loading",
    error,
    selectPet,
    refreshPets,
  }}>
    <Suspense fallback={null}><ActivePetRouteSync /></Suspense>
    {children}
  </ActivePetContext.Provider>;
}

function ActivePetRouteSync() {
  const pathname = usePathname();
  const { selectPet, refreshPets } = useActivePet();
  useEffect(() => { void refreshPets(); }, [pathname, refreshPets]);
  useEffect(() => {
    const petId = petIdFromPath(pathname);
    if (petId !== null) selectPet(petId);
  }, [pathname, selectPet]);
  return null;
}
