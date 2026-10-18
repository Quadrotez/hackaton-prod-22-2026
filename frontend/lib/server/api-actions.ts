// Names the user actions behind proxied API calls, so production logs say
// "pet.created" or "transfer.accepted" instead of only "POST /api/v1/pets/".
// Only mutations are named; reads are logged as plain access lines.

export type ApiAction = {
  event: string;
  // Ids taken from the path (pet_id, transfer_id, ...), never request bodies.
  ids: Record<string, number | string>;
  // Calls the backend forwards to an external service (LLM document analysis).
  external?: string;
};

type Rule = [method: string, pattern: string, event: string, external?: string];

// ":name" segments become log fields; "*" matches the rest of the path.
const RULES: Rule[] = [
  ["POST", "auth/register", "user.registered"],
  ["POST", "auth/login", "user.logged_in"],
  ["PATCH", "auth/me", "user.profile_updated"],
  ["PATCH", "auth/me/password", "user.password_changed"],
  ["POST", "auth/me/avatar", "user.avatar_uploaded"],

  ["POST", "pets", "pet.created"],
  ["PATCH", "pets/:pet_id", "pet.updated"],
  ["DELETE", "pets/:pet_id", "pet.deleted"],
  ["POST", "pets/:pet_id/photo", "pet.photo_uploaded"],

  ["POST", "pets/:pet_id/vet-documents/analyze", "vet_document.analyzed", "llm"],

  ["POST", "pets/:pet_id/transfers", "transfer.created"],
  ["POST", "transfers/:transfer_id/cancel", "transfer.cancelled"],
  ["POST", "transfers/:transfer_id/accept", "transfer.accepted"],
  ["POST", "transfers/:transfer_id/decline", "transfer.declined"],
  ["POST", "transfers/:transfer_id/return", "transfer.return_requested"],
  ["POST", "transfers/:transfer_id/cancel-return", "transfer.return_cancelled"],
  ["POST", "transfers/:transfer_id/confirm-return", "transfer.return_confirmed"],

  ["POST", "calendar/feed", "calendar_feed.created"],
  ["DELETE", "calendar/feed", "calendar_feed.revoked"],

  ["POST", "foods", "food.created"],
  ["PATCH", "foods/:food_id", "food.updated"],
  ["DELETE", "foods/:food_id", "food.deleted"],

  ["PUT", "pets/:pet_id/pregnancy", "pregnancy.saved"],
  ["DELETE", "pets/:pet_id/pregnancy", "pregnancy.ended"],

  ["POST", "pets/:pet_id/measurement-parameters/apply-template", "measurement_template.applied"],
  ["POST", "pets/:pet_id/measurement-parameters/:parameter_id/measurements", "measurement.created"],
  ["PATCH", "pets/:pet_id/measurement-parameters/:parameter_id/measurements/:measurement_id", "measurement.updated"],
  ["DELETE", "pets/:pet_id/measurement-parameters/:parameter_id/measurements/:measurement_id", "measurement.deleted"],

  ["PUT", "pets/:pet_id/medications/:medication_id/intakes/*", "medication_intake.marked"],
  ["DELETE", "pets/:pet_id/medications/:medication_id/intakes/*", "medication_intake.unmarked"],
];

const COMPILED = RULES.map(([method, pattern, event, external]) => {
  const keys: string[] = [];
  const source = pattern
    .split("/")
    .map((segment) => {
      if (segment === "*") return "(?:/.*)?";
      if (!segment.startsWith(":")) return `/${segment}`;
      keys.push(segment.slice(1));
      return "/([^/]+)";
    })
    .join("");
  return { method, regex: new RegExp(`^${source.slice(1)}$`), keys, event, external };
});

// Plain per-pet collections: POST creates, PATCH updates, DELETE removes a record.
const PET_RECORDS: Record<string, string> = {
  "feeding-records": "feeding_record",
  vaccinations: "vaccination",
  "parasite-treatments": "parasite_treatment",
  medications: "medication",
  visits: "vet_visit",
  symptoms: "symptom",
  allergies: "allergy",
  "measurement-parameters": "measurement_parameter",
};

const PET_RECORD_PATH = /^pets\/([^/]+)\/([a-z-]+)(?:\/([^/]+))?$/;

const VERB_EVENTS: Record<string, string> = { POST: "created", PATCH: "updated", PUT: "updated", DELETE: "deleted" };

function parseId(value: string): number | string {
  return /^\d+$/.test(value) ? Number(value) : value;
}

export function describeApiAction(method: string, segments: string[]): ApiAction | null {
  if (method === "GET" || method === "HEAD") return null;
  const path = segments.join("/").replace(/\/+$/, "");

  for (const rule of COMPILED) {
    if (rule.method !== method) continue;
    const match = rule.regex.exec(path);
    if (!match) continue;
    const ids = Object.fromEntries(rule.keys.map((key, index) => [key, parseId(match[index + 1])]));
    return { event: rule.event, ids, external: rule.external };
  }

  const record = PET_RECORD_PATH.exec(path);
  const [, petId, collection, recordId] = record ?? [];
  // POST goes to the collection, PATCH/PUT/DELETE to one record.
  if (record && collection in PET_RECORDS && VERB_EVENTS[method] && (recordId === undefined) === (method === "POST")) {
    const ids: ApiAction["ids"] = { pet_id: parseId(petId) };
    if (recordId !== undefined) ids.record_id = parseId(recordId);
    return { event: `${PET_RECORDS[collection]}.${VERB_EVENTS[method]}`, ids };
  }

  return { event: "api.mutation", ids: {} };
}
