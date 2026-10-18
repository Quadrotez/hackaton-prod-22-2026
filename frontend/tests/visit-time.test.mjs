import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Тест в московском поясе: в нём 03:00 местного времени = 00:00 UTC.
process.env.TZ = "Europe/Moscow";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadVisitTime() {
  const file = path.resolve(__dirname, "../lib/visit-time.ts");
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("module", "exports", compiled)(loaded, loaded.exports);
  return loaded.exports;
}
const visitTime = loadVisitTime();

test("«время не указано» отправляется ровно как 00:00:00 UTC", () => {
  assert.equal(visitTime.visitAtPayload("2026-10-17", null), "2026-10-17T00:00:00.000Z");
  assert.equal(visitTime.visitAtPayload("2026-10-17", ""), "2026-10-17T00:00:00.000Z");
});

test("обычное время переводится в UTC", () => {
  assert.equal(visitTime.visitAtPayload("2026-10-22", "11:30"), "2026-10-22T08:30:00.000Z");
  // Местная полночь в Москве — 21:00 UTC, бэкенд её не трогает.
  assert.equal(visitTime.visitAtPayload("2026-10-22", "00:00"), "2026-10-21T21:00:00.000Z");
});

test("время, попадающее ровно на 00:00 UTC, отправляется с одной секундой", () => {
  const payload = visitTime.visitAtPayload("2026-10-22", "03:00");
  assert.equal(payload, "2026-10-22T00:00:01.000Z");
  assert.equal(visitTime.isDateOnlyVisit(payload), false);
  // Секунда не видна пользователю: время в форме остаётся 03:00.
  assert.equal(visitTime.visitTimeText(payload), "03:00");
});

test("визит без времени распознаётся по ответу API в любом формате", () => {
  for (const value of ["2026-10-17T00:00:00Z", "2026-10-17T00:00:00+00:00", "2026-10-17T03:00:00+03:00"]) {
    assert.equal(visitTime.isDateOnlyVisit(value), true, value);
  }
  for (const value of ["2026-10-17T00:00:01Z", "2026-10-17T00:00:00.001Z", "2026-10-17T00:00:00+03:00"]) {
    assert.equal(visitTime.isDateOnlyVisit(value), false, value);
  }
});

test("дата визита без времени берётся по UTC, а с временем — местная", () => {
  assert.equal(visitTime.visitDateKey("2026-10-17T00:00:00Z"), "2026-10-17");
  assert.equal(visitTime.visitTimeText("2026-10-17T00:00:00Z"), "");
  // 22:30 UTC — это уже следующий день в Москве.
  assert.equal(visitTime.visitDateKey("2026-10-31T22:30:00Z"), "2026-11-01");
  assert.equal(visitTime.visitTimeText("2026-10-31T22:30:00Z"), "01:30");
});

test("форма редактирования заполняется из сохранённого визита", () => {
  assert.deepEqual(visitTime.visitFormValues("2026-10-17T00:00:00Z"), {
    visit_date: "2026-10-17", visit_time: "", visit_time_unknown: "on",
  });
  assert.deepEqual(visitTime.visitFormValues("2026-10-22T08:30:00Z"), {
    visit_date: "2026-10-22", visit_time: "11:30", visit_time_unknown: "",
  });
  // Сохранение без изменений даёт тот же visit_at.
  const { visit_date, visit_time } = visitTime.visitFormValues("2026-10-22T00:00:01Z");
  assert.equal(visitTime.visitAtPayload(visit_date, visit_time), "2026-10-22T00:00:01.000Z");
});

test("визит без времени показывается без часов", () => {
  assert.equal(visitTime.formatVisitAt("2026-10-17T00:00:00Z"), "17 октября 2026 г.");
  assert.match(visitTime.formatVisitAt("2026-10-22T08:30:00Z"), /^22 октября 2026 г\..*11:30$/);
});
