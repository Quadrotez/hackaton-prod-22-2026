// Интеграционные тесты фронтенда: реальные lib-модули против настоящего FastAPI
// (изолированная SQLite через backend-bridge.py). Запуск:
//   PETCARE_TEST_PYTHON=backend/.venv/bin/python node --test tests/integration.test.mjs
// Названия тестов = список покрытых сценариев (см. SCENARIOS.md в корне репозитория).
import { test } from "node:test";
import assert from "node:assert/strict";
import { client, memorySession, startBackend } from "./helpers/bridge.mjs";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUqzjBwMDAxMDAwMDAAAAP6AFiUX/w7AAAAABJRU5ErkJggg==";

async function registerUser(request, email, password, name = null) {
  const response = await request("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, name, password }),
  });
  assert.ok([200, 201, 409].includes(response.status), await response.clone().text());
}

test("жизненный цикл аккаунта: регистрация, логин, профиль и смена пароля на настоящем API", { skip: !process.env.PETCARE_TEST_PYTHON, timeout: 60_000 }, async (t) => {
  const request = await startBackend(t);
  const session = memorySession();
  const { load } = client(request, { session });
  const auth = load("lib/auth");
  const api = load("lib/api");

  await registerUser(request, "integration@example.com", "integration-pass-123", "Integration");
  await auth.login({ email: "integration@example.com", password: "integration-pass-123" });
  assert.equal(session.getAccessToken() !== null, true, "login() должен сохранить токен в сессии");

  const me = await auth.getMe();
  assert.equal(me.email, "integration@example.com");
  assert.equal(me.name, "Integration");

  const updated = await auth.updateMe({ name: "Новое имя" });
  assert.equal(updated.name, "Новое имя");
  assert.equal((await auth.getMe()).name, "Новое имя");

  await auth.updatePassword({ current_password: "integration-pass-123", new_password: "brand-new-pass-456" });
  session.clearAccessToken();
  await auth.login({ email: "integration@example.com", password: "brand-new-pass-456" });
  assert.equal(session.getAccessToken() !== null, true, "логин со сменённым паролем работает");

  await assert.rejects(
    () => auth.login({ email: "integration@example.com", password: "wrong-password-123" }),
    (error) => error instanceof api.ApiError && error.status === 401 && error.message === "Неверный email или пароль",
  );

  await assert.rejects(
    () => auth.updatePassword({ current_password: "неверный-пароль-1", new_password: "another-new-pass-7" }),
    (error) => error instanceof api.ApiError && error.message === "Неверный текущий пароль",
  );

  await assert.rejects(
    () => auth.registerAndLogin({ email: "integration@example.com", password: "another-pass-789" }),
    (error) => error instanceof api.ApiError && error.message === "Пользователь с таким email уже зарегистрирован",
  );
});

test("CRUD питомца: вес ведётся историей, валидация возраста, удаление даёт 404", { skip: !process.env.PETCARE_TEST_PYTHON, timeout: 60_000 }, async (t) => {
  const request = await startBackend(t);
  const session = memorySession();
  const { load } = client(request, { session });
  const pets = load("lib/pets");
  const petWeight = load("lib/pet-weight");
  const api = load("lib/api");

  await registerUser(request, "pets-owner@example.com", "pets-owner-pass-123", null);
  await load("lib/auth").login({ email: "pets-owner@example.com", password: "pets-owner-pass-123" });

  const created = await pets.createPet({ name: "Барсик", species: "cat", sex: "boy", weight_g: 4000 });
  assert.equal(created.name, "Барсик");
  assert.equal(created.weight_g, 4000);

  let history = await petWeight.getPetWeightHistory(created.id);
  assert.equal(history.length, 1, "вес при создании даёт первую точку истории");
  assert.equal(history[0].weight_g, 4000);

  const updated = await pets.updatePet(created.id, { weight_g: 4500 });
  assert.equal(updated.weight_g, 4500);
  history = await petWeight.getPetWeightHistory(created.id);
  assert.equal(history.length, 2, "PATCH веса добавляет точку истории (контракт страницы измерений)");
  assert.deepEqual(history.map((point) => point.weight_g).sort((a, b) => a - b), [4000, 4500]);
  assert.deepEqual(
    petWeight.weightChartData(history).map((point) => point.weight),
    [4, 4.5],
    "weightChartData переводит граммы в килограммы и сортирует по времени",
  );

  await assert.rejects(
    () => pets.updatePet(created.id, { birth_date: "2024-05-10", approximate_age_years: 2 }),
    (error) => error instanceof api.ApiError && error.status === 422,
  );

  const aged = await pets.createPet({ name: "Старик", species: "cat", sex: "girl", weight_g: 3000, approximate_age_years: 3 });
  await assert.rejects(
    () => pets.updatePet(aged.id, { birth_date: "2022-01-10" }),
    (error) => error instanceof api.ApiError && error.message === "Укажите либо дату рождения, либо примерный возраст",
  );

  const listed = await pets.listPets();
  assert.deepEqual(listed.map((pet) => pet.id).sort((a, b) => a - b), [created.id, aged.id]);

  await pets.deletePet(created.id);
  await assert.rejects(
    () => pets.getPet(created.id),
    (error) => error instanceof api.ApiError && error.status === 404 && error.message === "Питомец не найден",
  );
});

test("кормление: приёмы пищи, подстановка прошлой реакции и сохранение названия корма", { skip: !process.env.PETCARE_TEST_PYTHON, timeout: 60_000 }, async (t) => {
  const request = await startBackend(t);
  const session = memorySession();
  const { load } = client(request, { session });
  const pets = load("lib/pets");
  const foods = load("lib/foods");
  const meals = load("lib/meals");

  await registerUser(request, "feeder@example.com", "feeder-pass-1234", null);
  await load("lib/auth").login({ email: "feeder@example.com", password: "feeder-pass-1234" });
  const pet = await pets.createPet({ name: "Рекс", species: "dog", sex: "boy", weight_g: 12000 });

  const food = await foods.createFood({
    name: "Royal Canin",
    description: "Сухой корм",
    type: "dry",
    protein: 30,
    fats: 12,
    carbohydrates: 40,
    calories: 350,
    total_grams: 2000,
    remaining_grams: 1500,
  });
  const treat = await foods.createFood({
    name: "Pedigree",
    description: "Лакомство",
    type: "treat",
    protein: 15,
    fats: 8,
    carbohydrates: 55,
    calories: 300,
    total_grams: 500,
    remaining_grams: 400,
  });

  const now = "2026-10-17T10:00:00";
  const first = await meals.createMeal(pet.id, { food_id: food.id, amount_grams: 100, fed_at: now, liked: true, tolerated: true, reaction_notes: "Ест с удовольствием" });
  assert.equal(first.food_name, "Royal Canin");

  const foodsAfterFeeding = await foods.listFoods();
  const fedFood = foodsAfterFeeding.find((item) => item.id === food.id);
  assert.equal(fedFood.remaining_grams, 1400, "запись кормления списывает граммы из остатка корма");

  const suggestion = await meals.getMealSuggestion(pet.id, food.id);
  assert.equal(suggestion.previously_tried, true);
  assert.deepEqual(suggestion.suggested_values, { liked: true, tolerated: true }, "подсказка подставляет реакцию из последнего приёма этого корма");

  const freshSuggestion = await meals.getMealSuggestion(pet.id, treat.id);
  assert.equal(freshSuggestion.previously_tried, false);
  assert.ok(!freshSuggestion.suggested_values);

  const updated = await meals.updateMeal(pet.id, first.id, { reaction_notes: "Обновлено" });
  assert.equal(updated.reaction_notes, "Обновлено");

  const ranked = meals.rankFoods([treat, food], [first]);
  assert.deepEqual(ranked.map((item) => item.food.id), [food.id, treat.id], "rankFoods поднимает корма с положительной историей наверх");

  await foods.deleteFood(food.id);
  const afterDelete = await meals.listMeals(pet.id);
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].food_id, null, "после удаления корма приём теряет food_id");
  assert.equal(afterDelete[0].food_name, "Royal Canin", "но сохраняет название — fallback интерфейса");

  await meals.deleteMeal(pet.id, first.id);
  assert.equal((await meals.listMeals(pet.id)).length, 0);
});

test("кормление: типы реакций (ЖКТ, аллергия) и перенос реакции в симптомы", { skip: !process.env.PETCARE_TEST_PYTHON, timeout: 60_000 }, async (t) => {
  const request = await startBackend(t);
  const session = memorySession();
  const { load } = client(request, { session });
  const pets = load("lib/pets");
  const foods = load("lib/foods");
  const meals = load("lib/meals");
  const api = load("lib/api");

  await registerUser(request, "reactions@example.com", "reactions-pass-1234", null);
  await load("lib/auth").login({ email: "reactions@example.com", password: "reactions-pass-1234" });
  const pet = await pets.createPet({ name: "Барсик", species: "cat", sex: "boy", weight_g: 4000 });
  const food = await foods.createFood({
    name: "Fish Mix", description: "Влажный корм", type: "wet", protein: 10, fats: 5,
    carbohydrates: 3, calories: 90, total_grams: 1000,
  });

  const fed = await meals.createMeal(pet.id, {
    food_id: food.id, amount_grams: 85, fed_at: "2026-10-17T10:00:00", liked: true, tolerated: false,
    digestive_reaction: true, allergic_reaction: true, reaction_notes: "рвота и зуд",
  });
  assert.equal(fed.digestive_reaction, true);
  assert.equal(fed.allergic_reaction, true);
  assert.deepEqual(meals.reactionLabels(fed), ["ЖКТ", "аллергия"]);
  assert.equal(meals.rankFoods([food], [fed])[0].allergic, true, "корм с аллергией помечается при выборе");

  await assert.rejects(
    meals.updateMeal(pet.id, fed.id, { tolerated: true }),
    (error) => error instanceof api.ApiError && error.status === 422,
    "«перенёс хорошо» при отмеченной реакции — противоречие",
  );
  const cleared = await meals.updateMeal(pet.id, fed.id, { tolerated: true, digestive_reaction: false, allergic_reaction: false });
  assert.equal(meals.hasReactionType(cleared), false);
  const flagged = await meals.updateMeal(pet.id, fed.id, { tolerated: false, allergic_reaction: true });

  const symptom = await meals.recordReactionAsSymptom(pet.id, flagged);
  assert.equal(symptom.description, "Реакция на корм «Fish Mix»: аллергическая реакция — рвота и зуд");
  const health = await load("lib/health").loadHealth(pet.id);
  assert.deepEqual(health.symptoms.map((item) => item.description), [symptom.description], "симптом виден в карте здоровья");
  assert.equal(new Date(health.symptoms[0].observed_at).getTime(), new Date(flagged.fed_at).getTime(), "время симптома — время кормления");
});

test("измерения: шаблонные параметры, CRUD серий и история веса (новый код без покрытия)", { skip: !process.env.PETCARE_TEST_PYTHON, timeout: 60_000 }, async (t) => {
  const request = await startBackend(t);
  const session = memorySession();
  const { load } = client(request, { session });
  const pets = load("lib/pets");
  const measurements = load("lib/measurements");
  const api = load("lib/api");

  await registerUser(request, "measurer@example.com", "measurer-pass-12", null);
  await load("lib/auth").login({ email: "measurer@example.com", password: "measurer-pass-12" });
  const pet = await pets.createPet({ name: "Мурка", species: "cat", sex: "girl", weight_g: 3500 });

  const initial = await measurements.listMeasurementParameters(pet.id);
  assert.ok(initial.length >= 5, "для кошки при первом запросе создаются шаблонные параметры");
  assert.ok(initial.some((parameter) => parameter.name === "Рост в холке" && parameter.unit === "см"));

  const added = await measurements.addMeasurementParameter(pet.id, { name: "Хвост", unit: "см" });
  await assert.rejects(
    () => measurements.addMeasurementParameter(pet.id, { name: "Хвост", unit: null }),
    (error) => error instanceof api.ApiError && error.message === "Параметр с таким названием уже есть",
  );

  const first = await measurements.saveMeasurement(pet.id, added.id, { value: 30.5, measured_at: "2026-10-17T09:00:00" });
  assert.equal(first.value, 30.5);
  const second = await measurements.saveMeasurement(pet.id, added.id, { value: 31.2, measured_at: "2026-10-17T21:00:00" }, first.id);
  assert.equal(second.id, first.id, "PATCH сохраняет то же измерение");

  await pets.updatePet(pet.id, { weight_g: 3600 });
  const data = await measurements.loadMeasurements(pet.id);
  assert.equal(data.pet.id, pet.id);
  assert.ok(data.parameters.some((parameter) => parameter.name === "Хвост" && parameter.history.length === 1));
  assert.ok(data.weights.length >= 2, "вес приходит в общую выборку измерений страницы");
  assert.equal(data.weights.at(-1).weight_g, 3600);

  await measurements.deleteMeasurementParameter(pet.id, added.id);
  await assert.rejects(
    () => measurements.listMeasurements(pet.id, added.id),
    (error) => error instanceof api.ApiError && error.status === 404,
  );
});

test("дашборд: календарь собирает визиты, прививки и дозы лекарств всех питомцев", { skip: !process.env.PETCARE_TEST_PYTHON, timeout: 60_000 }, async (t) => {
  const request = await startBackend(t);
  const session = memorySession();
  const { load } = client(request, { session });
  const pets = load("lib/pets");
  const health = load("lib/health");
  const healthEvents = load("lib/health-events");

  await registerUser(request, "dashboard@example.com", "dashboard-pass-1", null);
  await load("lib/auth").login({ email: "dashboard@example.com", password: "dashboard-pass-1" });
  const pet = await pets.createPet({ name: "Сима", species: "cat", sex: "girl", weight_g: 3000 });

  const today = new Date().toISOString().slice(0, 10);
  const visitResponse = await request(`/api/v1/pets/${pet.id}/visits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.getAccessToken()}` },
    body: JSON.stringify({ title: "Плановый осмотр", visit_at: `${today}T12:00`, reason: "checkup", status: "planned" }),
  });
  assert.equal(visitResponse.status, 201, await visitResponse.clone().text());
  const medicationResponse = await request(`/api/v1/pets/${pet.id}/medications`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.getAccessToken()}` },
    body: JSON.stringify({ name: "Витамины", dose: "1 таб.", start_date: today, end_date: today, times: ["08:00:00"], interval_days: 1 }),
  });
  assert.equal(medicationResponse.status, 201, await medicationResponse.clone().text());

  const from = `${today.slice(0, 7)}-01`;
  const to = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const calendar = await health.loadCalendar(from, to);
  assert.equal(calendar.pets.length, 1);
  assert.equal(calendar.range, `${from}/${to}`);
  assert.ok(calendar.events.some((event) => event.title === "Плановый осмотр" && event.kind === "visit"));
  assert.ok(calendar.events.some((event) => event.title === "Витамины" && event.kind === "medicine"), "дозы лекарств попадают в календарь дашборда");

  const visitEvent = calendar.events.find((event) => event.kind === "visit");
  assert.equal(healthEvents.healthEventHref(visitEvent), `/pet/${pet.id}/health/visits#health-${visitEvent.recordKey}`);
});

test("обработки от паразитов: CRUD, авторасчёт срока и календарь на настоящем API", { skip: !process.env.PETCARE_TEST_PYTHON, timeout: 60_000 }, async (t) => {
  const request = await startBackend(t);
  const session = memorySession();
  const { load } = client(request, { session });
  const pets = load("lib/pets");
  const health = load("lib/health");
  const sections = load("lib/health-sections");
  const events = load("lib/health-events");

  await registerUser(request, "parasite@example.com", "parasite-pass-123", null);
  await load("lib/auth").login({ email: "parasite@example.com", password: "parasite-pass-123" });
  const pet = await pets.createPet({ name: "Симба", species: "cat", sex: "boy", weight_g: 4200 });

  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.parse(`${today}T00:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10);
  const created = await sections.saveHealthRecord(pet.id, "parasites", {
    kind: "external", product_name: "Стронгхолд", treated_on: today, interval_days: 90,
  });
  assert.equal(created.interval_days, 90);
  assert.equal(created.next_due_on, due, "сервер считает дату следующей обработки из интервала");

  const listed = await sections.listHealthRecords(pet.id, "parasites");
  assert.equal(listed.length, 1);

  const dashboard = await sections.loadHealthDashboard(pet.id);
  assert.equal(dashboard.overview.next_parasite.id, created.id);

  const currentMonth = await health.loadCalendar(`${today.slice(0, 7)}-01`, `${today.slice(0, 7)}-28`);
  assert.equal(currentMonth.events.some((event) => event.kind === "parasite"), false, "будущая обработка не попадает в календарь текущего месяца");

  const calendar = await health.loadCalendar(due, due, pet.id);
  const parasiteEvent = calendar.events.find((event) => event.kind === "parasite");
  assert.ok(parasiteEvent, "событие обработки попадает в календарь");
  assert.equal(parasiteEvent.date, due);
  assert.equal(events.healthEventHref(parasiteEvent), `/pet/${pet.id}/health/parasites#health-parasite-${created.id}`);

  await sections.saveHealthRecord(pet.id, "parasites", { interval_days: 30 }, created.id);
  const updated = await sections.listHealthRecords(pet.id, "parasites");
  assert.equal(updated[0].next_due_on !== null, true);

  await sections.deleteHealthRecord(pet.id, { resource: "parasites", value: created });
  assert.equal((await sections.listHealthRecords(pet.id, "parasites")).length, 0);
});

test("фото: загрузка фото питомца и аватара пользователя (multipart через настоящий API)", { skip: !process.env.PETCARE_TEST_PYTHON, timeout: 60_000 }, async (t) => {
  const request = await startBackend(t);
  const session = memorySession();
  const { load } = client(request, { session });
  const pets = load("lib/pets");
  const auth = load("lib/auth");

  await registerUser(request, "photographer@example.com", "photographer-p-1", null);
  await auth.login({ email: "photographer@example.com", password: "photographer-p-1" });
  const pet = await pets.createPet({ name: "Лапа", species: "cat", sex: "boy", weight_g: 4200 });

  const photo = new File([Buffer.from(PNG_B64, "base64")], "lapa.png", { type: "image/png" });
  const withPhoto = await pets.uploadPetPhoto(pet.id, photo);
  assert.equal(typeof withPhoto.photo_url, "string");
  assert.ok(withPhoto.photo_url.length > 0, "uploadPetPhoto сохраняет ссылку на фото");

  const avatar = new File([Buffer.from(PNG_B64, "base64")], "avatar.png", { type: "image/png" });
  const withAvatar = await auth.uploadAvatar(avatar);
  assert.equal(typeof withAvatar.avatar_url, "string");
  assert.ok(withAvatar.avatar_url.length > 0, "uploadAvatar сохраняет ссылку на аватар");
});
