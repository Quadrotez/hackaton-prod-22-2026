import { apiFetch } from "@/lib/api";

export type TransferDuration = "week" | "month" | "three_months" | "indefinite";

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

export type TransferCreate = {
  recipient_email: string;
  duration: TransferDuration;
};

export const transferDurationOptions: { value: TransferDuration; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "three_months", label: "3 месяца" },
  { value: "indefinite", label: "Бессрочно" },
];

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
  return transferDurationOptions.find((option) => option.value === duration)?.label ?? duration;
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
  return apiFetch<PetTransfer>(`/api/v1/transfers/${transferId}/accept`, { method: "POST", auth: true });
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
  return apiFetch<PetTransfer>(`/api/v1/transfers/${transferId}/confirm-return`, { method: "POST", auth: true });
}
