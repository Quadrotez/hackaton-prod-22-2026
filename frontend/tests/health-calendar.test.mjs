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

test("сохранённый визит читается календарём; выполненный ведёт в историю, отменённый исчезает", async () => {
  const records = [];
  const requests = [];
  const { events, health } = clientModules(async (url, init) => {
    const parsed = new URL(url, "http://test.local");
    requests.push(parsed);
    assert.equal(init.headers.get("Authorization"), "Bearer test-token");
    if (url === "/api/v1/pets/") return Response.json([pet]);
    if (parsed.pathname.endsWith("/visits")) {
      if (init.method === "POST") { records.push({ ...JSON.parse(init.body), id: 7, pet_id: 1 }); return Response.json(records[0]); }
      return Response.json(records);
    }
    if (parsed.pathname.endsWith("/visits/7")) { Object.assign(records[0], JSON.parse(init.body)); return Response.json(records[0]); }
    if (parsed.pathname.endsWith("/vaccinations") || parsed.pathname.endsWith("/medications/schedule")) return Response.json([]);
    throw new Error(`Unexpected request ${url}`);
  });
  await health.saveHealth(1, "visits", visit);
  let result = await health.loadCalendar("2026-10-01", "2026-11-11");
  assert.equal(result.events.length, 1);
  const href = events.healthEventHref(result.events[0]);
  assert.match(href, /^\/pet\/1\/health\?view=plan&event=visit-7#health-visit-7$/);
  const schedule = requests.find((url) => url.pathname.endsWith("/medications/schedule"));
  assert.equal(schedule.searchParams.get("from"), "2026-10-01");
  assert.equal(schedule.searchParams.get("to"), "2026-11-11");
  await health.saveHealth(1, "visits/7", { status: "completed" }, "PATCH");
  result = await health.loadCalendar("2026-10-01", "2026-11-11");
  assert.equal(result.events[0].completed, true);
  assert.match(events.healthEventHref(result.events[0]), /view=history/);
  await health.saveHealth(1, "visits/7", { status: "cancelled" }, "PATCH");
  result = await health.loadCalendar("2026-10-01", "2026-11-11");
  assert.equal(result.events.length, 0);
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
  assert.match(events.healthEventHref(result[1]), /event=medicine-3/);
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
