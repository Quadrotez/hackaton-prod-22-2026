import { apiFetch } from "@/lib/api";

export type FeedingRecord = {
  id: number;
  pet_id: number;
  food_name: string;
  fed_at: string;
  liked: boolean;
  tolerated: boolean;
  reaction_notes: string | null;
  notes: string | null;
  created_at: string;
};

export type FeedingRecordCreate = {
  food_name: string;
  fed_at: string;
  liked?: boolean;
  tolerated?: boolean;
  reaction_notes?: string | null;
  notes?: string | null;
};

export type FeedingRecordUpdate = Partial<FeedingRecordCreate>;

export type FeedingSuggestion = {
  food_name: string;
  previously_tried: boolean;
  suggested_values: { liked: boolean; tolerated: boolean } | null;
};

function recordsPath(petId: number) {
  return `/api/v1/pets/${petId}/feeding-records`;
}

export function listFeedingRecords(petId: number) {
  return apiFetch<FeedingRecord[]>(recordsPath(petId), { method: "GET", auth: true });
}

export function createFeedingRecord(petId: number, data: FeedingRecordCreate) {
  return apiFetch<FeedingRecord>(recordsPath(petId), { method: "POST", body: data, auth: true });
}

export function updateFeedingRecord(
  petId: number,
  recordId: number,
  data: FeedingRecordUpdate,
) {
  return apiFetch<FeedingRecord>(`${recordsPath(petId)}/${recordId}`, {
    method: "PATCH",
    body: data,
    auth: true,
  });
}

export function deleteFeedingRecord(petId: number, recordId: number) {
  return apiFetch<void>(`${recordsPath(petId)}/${recordId}`, { method: "DELETE", auth: true });
}

export function getFeedingSuggestion(petId: number, foodName: string) {
  const query = new URLSearchParams({ food_name: foodName });
  return apiFetch<FeedingSuggestion>(`${recordsPath(petId)}/suggestions?${query}`, {
    method: "GET",
    auth: true,
  });
}
