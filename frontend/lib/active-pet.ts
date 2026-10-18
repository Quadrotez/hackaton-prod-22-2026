export function petIdFromPath(pathname: string): number | null {
  const value = Number(pathname.match(/^\/pet\/(\d+)(?:\/|$)/)?.[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function petSwitchHref(pathname: string, petId: number, feeding = false): string {
  if (petIdFromPath(pathname) === null) return pathname;
  const section = pathname.replace(/^\/pet\/\d+/, "");
  // Keep the section, but never carry another pet's record links or edit drafts over.
  const suffix = /^\/(health|measurements)(\/|$)/.test(section) ? section : "";
  return `/pet/${petId}${suffix}${!suffix && feeding ? "?feed=1#feeding" : ""}`;
}

export const activePetStorageKey = (userId: number) => `petcare_active_pet:${userId}`;

export function readActivePetId(userId: number): number | null {
  try {
    const value = Number(localStorage.getItem(activePetStorageKey(userId)));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function rememberActivePet(userId: number, petId: number | null) {
  try {
    if (petId === null) localStorage.removeItem(activePetStorageKey(userId));
    else localStorage.setItem(activePetStorageKey(userId), String(petId));
  } catch {
    // Selection still works for this visit when browser storage is unavailable.
  }
}
