import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Загружаем TS-модули клиента без браузера; HTTP подменяется только в тесте.
function clientModules(fetchImpl) {
  const cache = new Map();
  const root = path.resolve(__dirname, "..");
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    function resolve(name) {
      if (name === "@/lib/session") return { getAccessToken: () => "test-token" };
      if (name === "@/lib/pets") {
        const { apiFetch } = load(path.join(root, "lib/api.ts"));
        return { listPets: () => apiFetch("/api/v1/pets/", { auth: true }), getPet: (id) => apiFetch(`/api/v1/pets/${id}`, { auth: true }) };
      }
      if (name.startsWith("@/")) return load(path.join(root, `${name.slice(2)}.ts`));
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), `${name}.ts`));
      throw new Error(`Unexpected module: ${name}`);
    }
    new Function("require", "module", "exports", "fetch", compiled)(resolve, loadedModule, loadedModule.exports, fetchImpl);
    return loadedModule.exports;
  }
  return { events: load(path.join(root, "lib/health-events.ts")), health: load(path.join(root, "lib/health.ts")) };
}
const pet = { id: 1, name: "Барсик" };
const visit = { id: 7, pet_id: 1, title: "Осмотр", visit_at: "2026-10-22T11:30:00+03:00", status: "planned", reason: "illness" };

test("сохранённый визит читается календарём и ведёт в раздел приёмов; отменённый исчезает", async () => {
  const records = [];
  const requests = [];
  const { events, health } = clientModules(async (url, init) => {
    const parsed = new URL(url, "http://test.local");
    requests.push(parsed);
    assert.equal(init.headers.get("Authorization"), "Bearer test-token");
    if (url === "/api/v1/pets/") return Response.json([pet]);
    if (parsed.pathname.endsWith("/visits")) {
      if (init.method === "POST") { records.push({ ...JSON.parse(init.body), id: 7, pet_id: 1 }); return Response.json(records[0]); }
    }
    if (parsed.pathname.endsWith("/visits/7")) { Object.assign(records[0], JSON.parse(init.body)); return Response.json(records[0]); }
    if (parsed.pathname === "/api/v1/calendar/events") {
      assert.equal(init.method ?? "GET", "GET");
      return Response.json(records.filter((record) => record.status !== "cancelled").map((record) => ({
        id: `visit-${record.id}`, type: "visit", source_id: record.id,
        pet_id: record.pet_id, pet_name: pet.name, title: record.title, detail: null,
        date: "2026-10-22", time: "11:30:00", status: record.status,
      })));
    }
    throw new Error(`Unexpected request ${url}`);
  });
  await health.saveHealth(1, "visits", visit);
  let result = await health.loadCalendar("2026-10-01", "2026-11-11");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].completed, false);
  assert.equal(result.events[0].date, "2026-10-22");
  assert.equal(result.events[0].time, "11:30");
  const href = events.healthEventHref(result.events[0]);
  assert.equal(href, "/pet/1/health/visits#health-visit-7");
  const calendar = requests.find((url) => url.pathname === "/api/v1/calendar/events");
  assert.equal(calendar.searchParams.get("from"), "2026-10-01");
  assert.equal(calendar.searchParams.get("to"), "2026-11-11");
  assert.equal(calendar.searchParams.get("tz"), health.timezone());
  assert.equal(calendar.searchParams.has("pet_id"), false);
  await health.saveHealth(1, "visits/7", { status: "completed" }, "PATCH");
  result = await health.loadCalendar("2026-10-01", "2026-11-11");
  assert.equal(result.events[0].completed, true);
  assert.equal(result.events[0].view, "history");
  assert.equal(events.healthEventHref(result.events[0]), "/pet/1/health/visits#health-visit-7");
  await health.saveHealth(1, "visits/7", { status: "cancelled" }, "PATCH");
  result = await health.loadCalendar("2026-10-01", "2026-11-11");
  assert.equal(result.events.length, 0);
});

test("единый API календаря получает активного питомца и сохраняет даты, время и ссылки событий", async () => {
  const records = [
    { id: "vaccination-2", type: "vaccination", source_id: 2, title: "Прививка", date: "2027-01-01", time: null, status: "done" },
    { id: "dose-3-20270101T0015", type: "medication", source_id: 3, title: "Лекарство", date: "2027-01-01", time: "00:15:00", status: "taken" },
    { id: "dose-3-20270101T1200", type: "medication", source_id: 3, title: "Лекарство", date: "2027-01-01", time: "12:00:00", status: "skipped" },
    { id: "parasite-5", type: "parasite", source_id: 5, title: "Обработка", date: "2027-01-02", time: null, status: "planned" },
    { id: "birthday-1-2027", type: "birthday", source_id: 1, title: "День рождения", date: "2027-01-03", time: null, status: "planned" },
  ];
  const { events, health } = clientModules(async (url, init) => {
    assert.equal(init.headers.get("Authorization"), "Bearer test-token");
    if (url === "/api/v1/pets/") return Response.json([pet]);
    const parsed = new URL(url, "http://test.local");
    assert.equal(parsed.pathname, "/api/v1/calendar/events");
    assert.equal(parsed.searchParams.get("pet_id"), "1");
    assert.equal(parsed.searchParams.get("from"), "2027-01-01");
    assert.equal(parsed.searchParams.get("to"), "2027-01-31");
    assert.equal(parsed.searchParams.get("tz"), health.timezone());
    return Response.json(records.map((record) => ({ ...record, pet_id: pet.id, pet_name: pet.name, detail: null })));
  });
  const result = await health.loadCalendar("2027-01-01", "2027-01-31", pet.id);
  assert.equal(result.petId, pet.id);
  assert.equal(result.range, "2027-01-01/2027-01-31");
  assert.deepEqual(result.events.map((event) => [event.kind, event.date, event.time, event.completed, event.view]), [
    ["vaccine", "2027-01-01", "", true, "history"],
    ["medicine", "2027-01-01", "00:15", true, "plan"],
    ["parasite", "2027-01-02", "", false, "plan"],
    ["birthday", "2027-01-03", "", false, "plan"],
  ]);
  assert.deepEqual(result.events.map(events.healthEventHref), [
    "/pet/1/health/vaccines#health-vaccine-2",
    "/pet/1/health/medicines#health-medicine-3",
    "/pet/1/health/parasites#health-parasite-5",
    "/pet/1",
  ]);
});

test("дата прививки и локальное время лекарства не сдвигаются; пропущенная доза скрыта", () => {
  const { events } = clientModules();
  const result = events.calendarEvents(pet, [], [{ id: 2, name: "Прививка", scheduled_on: "2027-01-01", status: "planned" }], [
    { medication_id: 3, name: "Лекарство", scheduled_for: "2027-01-01T00:15:00", status: "pending" },
    { medication_id: 3, name: "Лекарство", scheduled_for: "2027-01-01T12:00:00", status: "skipped" },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].date, "2027-01-01");
  assert.equal(result[1].date, "2027-01-01");
  assert.equal(result[1].time, "00:15");
  assert.equal(events.healthEventHref(result[0]), "/pet/1/health/vaccines#health-vaccine-2");
  assert.equal(events.healthEventHref(result[1]), "/pet/1/health/medicines#health-medicine-3");
});

test("визит учитывает часовой пояс, а ключи одинаковых ID у разных питомцев уникальны", () => {
  const { events } = clientModules();
  const input = { ...visit, visit_at: "2026-12-31T23:30:00Z" };
  const [first] = events.calendarEvents(pet, [input], [], []);
  const [second] = events.calendarEvents({ id: 2, name: "Рекс" }, [input], [], []);
  assert.equal(first.date, events.toDateKey(new Date(input.visit_at)));
  assert.notEqual(first.key, second.key);
  assert.match(events.healthEventHref(second), /^\/pet\/2\/health/);
});

test("сбой API не маскируется пустым календарём", async () => {
  const { health } = clientModules(async (url) => url === "/api/v1/pets/" ? Response.json([pet]) : Response.json({ detail: "Unavailable" }, { status: 503 }));
  await assert.rejects(() => health.loadCalendar("2026-10-01", "2026-11-11"), (error) => error.status === 503);
});

test("обработка с датой следующей процедуры становится событием parasite и ведёт в раздел обработок", () => {
  const { events } = clientModules();
  const treatment = { id: 5, pet_id: 1, kind: "external", product_name: "Стронгхолд", treated_on: "2026-10-01", interval_days: 90, next_due_on: "2026-12-30", clinic: null, notes: null };
  const result = events.calendarEvents(pet, [], [], [], [treatment]);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "parasite");
  assert.equal(result[0].title, "Стронгхолд");
  assert.equal(result[0].date, "2026-12-30");
  assert.equal(result[0].recordKey, "parasite-5");
  assert.equal(result[0].completed, false);
  assert.equal(events.healthEventHref(result[0]), "/pet/1/health/parasites#health-parasite-5");
});

test("обработка без даты следующей процедуры в календарь не попадает", () => {
  const { events } = clientModules();
  const treatment = { id: 6, pet_id: 1, kind: "internal", product_name: "Мильбемакс", treated_on: "2026-10-01", interval_days: null, next_due_on: null, clinic: null, notes: null };
  assert.equal(events.calendarEvents(pet, [], [], [], [treatment]).length, 0);
});

test("день рождения: событие каждый год в периоде с возрастом и ссылкой на карточку питомца", () => {
  const { events } = clientModules();
  const barsik = { ...pet, birth_date: "2023-03-12" };
  const range = { from: "2026-03-01", to: "2027-03-31", today: "2026-10-18" };
  const result = events.calendarEvents(barsik, [], [], [], [], range);
  assert.deepEqual(result.map((event) => [event.kind, event.date, event.title, event.time, event.completed]), [
    ["birthday", "2026-03-12", "День рождения, 3 года", "", true],
    ["birthday", "2027-03-12", "День рождения, 4 года", "", false],
  ]);
  assert.equal(events.healthEventHref(result[1]), "/pet/1");
  assert.notEqual(result[0].key, result[1].key);
});

test("день рождения: нет даты или нет периода — нет событий; первое через год после рождения", () => {
  const { events } = clientModules();
  const range = { from: "2026-01-01", to: "2026-12-31", today: "2026-10-18" };
  assert.equal(events.calendarEvents({ ...pet, birth_date: null }, [], [], [], [], range).length, 0);
  assert.equal(events.calendarEvents({ ...pet, birth_date: "2023-03-12" }, [], [], [], []).length, 0);
  assert.equal(events.calendarEvents({ ...pet, birth_date: "2026-03-12" }, [], [], [], [], range).length, 0);
});

test("день рождения 29 февраля в невисокосный год — 28 февраля; склонение возраста", () => {
  const { events } = clientModules();
  const leap = { ...pet, birth_date: "2020-02-29" };
  const dates = (from, to) => events.calendarEvents(leap, [], [], [], [], { from, to, today: from }).map((event) => [event.date, event.title]);
  assert.deepEqual(dates("2023-01-01", "2023-12-31"), [["2023-02-28", "День рождения, 3 года"]]);
  assert.deepEqual(dates("2024-01-01", "2024-12-31"), [["2024-02-29", "День рождения, 4 года"]]);
  assert.deepEqual(dates("2025-01-01", "2025-12-31"), [["2025-02-28", "День рождения, 5 лет"]]);
  assert.deepEqual(dates("2041-01-01", "2041-12-31"), [["2041-02-28", "День рождения, 21 год"]]);
});
