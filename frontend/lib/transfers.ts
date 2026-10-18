import { apiFetch } from "@/lib/api";
import { notifyPetsChanged } from "@/lib/pets-changed";

export type TransferDuration = "week" | "month" | "three_months" | "indefinite" | "custom";

export type TransferStatus =
  | "pending"
  | "accepted"
  | "return_requested"
  | "returned"
  | "declined"
  | "cancelled"
  | "expired";

export type TransferPet = {
  id: number;
  name: string;
  species: string;
  sex: "boy" | "girl";
  breed: string | null;
  birth_date: string | null;
  approximate_age_years: number | null;
};

export type TransferUser = {
  id: number;
  name: string | null;
  email: string;
};

export type PetTransfer = {
  id: number;
  role: "owner" | "recipient";
  status: TransferStatus;
  duration: TransferDuration;
  ends_at: string | null;
  pet: TransferPet;
  owner: TransferUser;
  recipient_email: string;
  recipient: TransferUser | null;
  created_at: string;
  responded_at: string | null;
  return_requested_at: string | null;
  ended_at: string | null;
};

export type TransferCreate = { recipient_email: string } & (
  | { duration: Exclude<TransferDuration, "custom">; ends_at?: never }
  | { ends_at: string; duration?: never }
);

// What the owner can pick in the form: a temporary transfer always has an end.
export type TransferPeriodChoice = "week" | "month" | "three_months" | "custom";

export const transferDurationOptions: { value: TransferPeriodChoice; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "three_months", label: "3 месяца" },
  { value: "custom", label: "До даты" },
];

const durationLabels: Record<TransferDuration, string> = {
  week: "неделя",
  month: "месяц",
  three_months: "3 месяца",
  indefinite: "бессрочно",
  custom: "до выбранной даты",
};

export const MAX_TRANSFER_DAYS = 366;

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

/** When a transfer chosen in the form ends; a custom date lasts until the end of that local day. */
export function transferEndDate(choice: TransferPeriodChoice, customDate: string, now: Date): Date | null {
  switch (choice) {
    case "week":
      return addDays(now, 7);
    case "month":
      return addMonths(now, 1);
    case "three_months":
      return addMonths(now, 3);
    case "custom": {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(customDate);
      if (!match) return null;
      const end = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 0);
      return Number.isNaN(end.getTime()) ? null : end;
    }
  }
}

/** Why a custom end date cannot be sent, or null when it is fine. */
export function customEndDateError(end: Date | null, now: Date): string | null {
  if (!end) return "Выберите дату окончания";
  if (end <= now) return "Дата окончания должна быть в будущем";
  if (end > addDays(now, MAX_TRANSFER_DAYS)) return `Не дальше чем на ${MAX_TRANSFER_DAYS} дней`;
  return null;
}

export function transferCreatePayload(
  email: string,
  choice: TransferPeriodChoice,
  customEnd: Date | null,
): TransferCreate {
  if (choice === "custom") {
    if (!customEnd) throw new Error("custom transfer needs an end date");
    return { recipient_email: email, ends_at: customEnd.toISOString() };
  }
  return { recipient_email: email, duration: choice };
}

/** yyyy-mm-dd of a local date, for <input type="date">. */
export function toDateInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const transferStatusLabels: Record<TransferStatus, string> = {
  pending: "Ожидает ответа",
  accepted: "Принята",
  return_requested: "Запрошен возврат",
  returned: "Питомец возвращён",
  declined: "Отклонена",
  cancelled: "Отменена",
  expired: "Истекла",
};

export const OPEN_TRANSFER_STATUSES: TransferStatus[] = ["pending", "accepted", "return_requested"];

export function isOpenTransfer(transfer: Pick<PetTransfer, "status">): boolean {
  return OPEN_TRANSFER_STATUSES.includes(transfer.status);
}

export function transferDurationLabel(duration: TransferDuration): string {
  return durationLabels[duration] ?? duration;
}

export function formatTransferDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function formatTransferEndsAt(transfer: Pick<PetTransfer, "duration" | "ends_at">): string {
  return transfer.ends_at ? `до ${formatTransferDate(transfer.ends_at)}` : "бессрочно";
}

export function transferPersonLabel(user: TransferUser | null, fallbackEmail: string): string {
  if (!user) return fallbackEmail;
  return user.name ? `${user.name} (${user.email})` : user.email;
}

function changedAccess(transfer: PetTransfer): PetTransfer {
  notifyPetsChanged();
  return transfer;
}

export function createTransfer(petId: number, data: TransferCreate): Promise<PetTransfer> {
  return apiFetch<PetTransfer>(`/api/v1/pets/${petId}/transfers`, {
    method: "POST",
    body: data,
    auth: true,
  });
}

export function listPetTransfers(petId: number): Promise<PetTransfer[]> {
  return apiFetch<PetTransfer[]>(`/api/v1/pets/${petId}/transfers`, { method: "GET", auth: true });
}

export function listIncomingTransfers(): Promise<PetTransfer[]> {
  return apiFetch<PetTransfer[]>("/api/v1/transfers/incoming", { method: "GET", auth: true });
}

export function listReceivedTransfers(): Promise<PetTransfer[]> {
  return apiFetch<PetTransfer[]>("/api/v1/transfers/received", { method: "GET", auth: true });
}

export function listOutgoingTransfers(): Promise<PetTransfer[]> {
  return apiFetch<PetTransfer[]>("/api/v1/transfers/outgoing", { method: "GET", auth: true });
}

export function cancelTransfer(transferId: number): Promise<PetTransfer> {
  return apiFetch<PetTransfer>(`/api/v1/transfers/${transferId}/cancel`, { method: "POST", auth: true });
}

export function acceptTransfer(transferId: number): Promise<PetTransfer> {
  // Changes which pets the caller can see.
  return apiFetch<PetTransfer>(`/api/v1/transfers/${transferId}/accept`, { method: "POST", auth: true }).then(changedAccess);
}

export function declineTransfer(transferId: number): Promise<PetTransfer> {
  return apiFetch<PetTransfer>(`/api/v1/transfers/${transferId}/decline`, { method: "POST", auth: true });
}

export function requestTransferReturn(transferId: number): Promise<PetTransfer> {
  return apiFetch<PetTransfer>(`/api/v1/transfers/${transferId}/return`, { method: "POST", auth: true });
}

export function cancelTransferReturn(transferId: number): Promise<PetTransfer> {
  return apiFetch<PetTransfer>(`/api/v1/transfers/${transferId}/cancel-return`, { method: "POST", auth: true });
}

export function confirmTransferReturn(transferId: number): Promise<PetTransfer> {
  // Changes which pets the caller can see.
  return apiFetch<PetTransfer>(`/api/v1/transfers/${transferId}/confirm-return`, { method: "POST", auth: true }).then(changedAccess);
}

export function endTransfer(transferId: number): Promise<PetTransfer> {
  // Changes which pets the caller can see.
  return apiFetch<PetTransfer>(`/api/v1/transfers/${transferId}/end`, { method: "POST", auth: true }).then(changedAccess);
}
