import { test } from "node:test";
import assert from "node:assert/strict";
import { client, startBackend } from "./helpers/bridge.mjs";

function body(resource, values, forms) {
  const fields = Object.fromEntries(forms.healthFields[resource].map((field) => [field.name, ""]));
  const result = forms.healthSchemas[resource].safeParse({ ...fields, ...values });
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
  return result.data;
}

test("состояние записи определяется статусом, а не прошедшей датой приёма", () => {
  const { load } = client(() => Promise.resolve(new Response()));
  const api = load("lib/health-sections");
  assert.equal(api.recordIsHistory({ resource: "visits", value: { status: "planned", visit_at: "2020-01-01" } }, "2026-10-17"), false);
  assert.equal(api.recordIsHistory({ resource: "visits", value: { status: "completed" } }, "2026-10-17"), true);
  assert.equal(api.recordIsHistory({ resource: "visits", value: { status: "cancelled" } }, "2026-10-17"), true);
  assert.equal(api.recordIsHistory({ resource: "medications", value: { end_date: "2026-10-16" } }, "2026-10-17"), true);
  assert.equal(api.recordIsHistory({ resource: "medications", value: { end_date: "2026-10-17" } }, "2026-10-17"), false);
});

test("валидация календарных дат, длительности курса и локального времени доз", () => {
  const { load } = client(() => Promise.resolve(new Response()));
  const forms = load("lib/health-form");
  assert.equal(forms.healthSchemas.vaccinations.safeParse({ name: "Прививка", scheduled_on: "2026-02-30", status: "planned", clinic: "", notes: "" }).success, false);
  assert.equal(forms.healthSchemas.medications.safeParse({ name: "Курс", dose: "1 таб.", start_date: "2026-10-17", end_date: "2026-10-01", interval_days: 1, times: "09:00", notes: "" }).success, false);
  assert.equal(forms.healthSchemas.medications.safeParse({ name: "Курс", dose: "1 таб.", start_date: "2026-10-17", end_date: "", interval_days: 1, times: "25:00", notes: "" }).success, false);
});

test("редактирование сохраняет все значения, время и расписание", () => {
  const { load } = client(() => Promise.resolve(new Response()));
  const forms = load("lib/health-form");
  const data = { today: "2026-10-17", now: "2026-10-17T10:00:00Z" };
  const values = forms.healthFormDefaults(data, "medications", { resource: "medications", value: { name: "Курс", dose: "1 таб.", start_date: "2026-10-01", end_date: null, times: ["09:00:00", "18:00:00"], interval_days: 2, notes: "После еды" } });
  assert.equal(values.times, "09:00, 18:00");
  assert.equal(values.notes, "После еды");
  assert.equal(values.end_date, "");
  assert.equal(forms.healthFormDefaults(data, "vaccinations", undefined, true).status, "done");
  assert.equal(forms.healthFormDefaults(data, "visits", undefined, true).status, "completed");
});

test("четыре подстраницы: формы проходят полный CRUD на настоящем health API", { skip: !process.env.PETCARE_TEST_PYTHON, timeout: 60_000 }, async (t) => {
  const request = await startBackend(t);
  const register = await request("/api/v1/auth/register", { method: "POST", body: JSON.stringify({ email: "health-pages-test@example.com", name: null, password: "health-pages-test-password" }) });
  assert.ok([200, 201, 409].includes(register.status), await register.clone().text());
  const login = await request("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "health-pages-test@example.com", password: "health-pages-test-password" }) });
  assert.equal(login.status, 200, await login.clone().text());
  const token = (await login.json()).access_token;
  const petResponse = await request("/api/v1/pets/", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "Test cat", species: "cat", sex: "girl", weight_g: 4000 }) });
  assert.equal(petResponse.status, 201, await petResponse.clone().text());
  const pet = await petResponse.json();
  const { load } = client(request, { session: { getAccessToken: () => token } });
  const api = load("lib/health-sections");
  const forms = load("lib/health-form");
  const start = await api.loadHealthSection(pet.id, "visits");
  const today = start.today;
  const samples = {
    visits: { title: "Осмотр", visit_at: `${today}T11:30`, reason: "illness", status: "planned", topic: "Пищеварение", doctor_name: "Иванова", diagnosis: "" },
    vaccinations: { name: "Комплексная", scheduled_on: today, status: "planned", clinic: "Клиника" },
    medications: { name: "Курс", dose: "1 таблетка", start_date: today, end_date: today, times: "09:00, 18:00", interval_days: 1 },
    symptoms: { description: "Необычный стул", observed_at: `${today}T09:30` },
    allergies: { allergen: "Курица", reactions: "Зуд" },
  };
  const recordIds = {};
  for (const [resource, values] of Object.entries(samples)) {
    const created = await api.saveHealthRecord(pet.id, resource, body(resource, values, forms));
    recordIds[resource] = created.id;
    const updated = await api.saveHealthRecord(pet.id, resource, body(resource, { ...values, ...(resource === "symptoms" ? { description: "Наблюдение уточнено" } : resource === "allergies" ? { reactions: "Чихание" } : { notes: "Сохранено после изменения" }) }, forms), created.id);
    assert.equal(updated.id, created.id);
  }
  for (const section of ["vaccines", "visits", "medicines", "symptoms"]) {
    const data = await api.loadHealthSection(pet.id, section);
    assert.equal(data.pet.id, pet.id);
    assert.ok(data.records.length > 0, section);
    if (section === "symptoms") assert.equal(data.records.length, 2);
    if (section === "medicines") {
      assert.equal(data.doses.length, 2);
      await api.markHealthDose(pet.id, data.doses[0], "taken");
      const marked = await api.loadHealthSection(pet.id, section);
      assert.equal(marked.doses[0].status, "taken");
      await api.clearHealthDose(pet.id, marked.doses[0]);
    }
  }
  const dashboard = await api.loadHealthDashboard(pet.id);
  assert.equal(dashboard.overview.planned_visits[0].title, "Осмотр");
  await api.saveHealthRecord(pet.id, "visits", { status: "completed", diagnosis: "Заключение" }, recordIds.visits);
  await api.saveHealthRecord(pet.id, "vaccinations", { status: "done" }, recordIds.vaccinations);
  const updatedVisits = await api.loadHealthSection(pet.id, "visits");
  assert.equal(api.recordIsHistory(updatedVisits.records[0], today), true);
  for (const [resource, id] of Object.entries(recordIds)) {
    await api.deleteHealthRecord(pet.id, { resource, value: { id } });
    assert.equal((await api.listHealthRecords(pet.id, resource)).length, 0);
  }
});
