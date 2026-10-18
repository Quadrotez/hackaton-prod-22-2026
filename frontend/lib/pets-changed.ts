// Tells the active pet switcher to reload the pet list (created, deleted, given or taken back).
export const PETS_CHANGED_EVENT = "petcare:pets-changed";

export function notifyPetsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PETS_CHANGED_EVENT));
}
