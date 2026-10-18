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
      if (name.startsWith("@/")) return load(path.join(root, `${name.slice(2)}.ts`));
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), `${name}.ts`));
      throw new Error(`Unexpected module: ${name}`);
    }
    new Function("require", "module", "exports", "fetch", compiled)(resolve, loadedModule, loadedModule.exports, fetchImpl);
    return loadedModule.exports;
  }
  return { transfers: load(path.join(root, "lib/transfers.ts")), api: load(path.join(root, "lib/api.ts")) };
}

test("длительности, статусы и форматы дат передачи локализованы", () => {
  const { transfers } = clientModules();
  assert.deepEqual(
    transfers.transferDurationOptions.map((option) => [option.value, option.label]),
    [
      ["week", "Неделя"],
      ["month", "Месяц"],
      ["three_months", "3 месяца"],
      ["indefinite", "Бессрочно"],
    ],
  );
  assert.equal(transfers.transferDurationLabel("three_months"), "3 месяца");
  assert.equal(transfers.transferStatusLabels.return_requested, "Запрошен возврат");
  assert.equal(transfers.formatTransferEndsAt({ duration: "indefinite", ends_at: null }), "бессрочно");
  assert.match(
    transfers.formatTransferEndsAt({ duration: "month", ends_at: "2026-11-01T10:00:00Z" }),
    /^до 1 ноября 2026/,
  );
  assert.equal(
    transfers.transferPersonLabel({ id: 1, name: "Гость", email: "guest@example.com" }, "guest@example.com"),
    "Гость (guest@example.com)",
  );
  assert.equal(transfers.transferPersonLabel(null, "guest@example.com"), "guest@example.com");
  assert.equal(transfers.isOpenTransfer({ status: "return_requested" }), true);
  assert.equal(transfers.isOpenTransfer({ status: "returned" }), false);
});

test("клиент передачи ходит в эндпоинты бэкенда с токеном и телом запроса", async () => {
  const requests = [];
  const transfer = { id: 5, status: "pending", role: "owner" };
  const { transfers } = clientModules(async (url, init) => {
    requests.push({ url, method: init.method, headers: init.headers, body: init.body });
    return Response.json(transfer);
  });

  await transfers.createTransfer(3, { recipient_email: "guest@example.com", duration: "week" });
  await transfers.acceptTransfer(5);
  await transfers.declineTransfer(5);
  await transfers.cancelTransfer(5);
  await transfers.requestTransferReturn(5);
  await transfers.cancelTransferReturn(5);
  await transfers.confirmTransferReturn(5);
  await transfers.listIncomingTransfers();
  await transfers.listReceivedTransfers();
  await transfers.listOutgoingTransfers();
  await transfers.listPetTransfers(3);

  const paths = requests.map((item) => `${item.method} ${new URL(item.url, "http://test.local").pathname}`);
  assert.deepEqual(paths, [
    "POST /api/v1/pets/3/transfers",
    "POST /api/v1/transfers/5/accept",
    "POST /api/v1/transfers/5/decline",
    "POST /api/v1/transfers/5/cancel",
    "POST /api/v1/transfers/5/return",
    "POST /api/v1/transfers/5/cancel-return",
    "POST /api/v1/transfers/5/confirm-return",
    "GET /api/v1/transfers/incoming",
    "GET /api/v1/transfers/received",
    "GET /api/v1/transfers/outgoing",
    "GET /api/v1/pets/3/transfers",
  ]);
  for (const item of requests) {
    assert.equal(item.headers.get("Authorization"), "Bearer test-token");
  }
  assert.deepEqual(JSON.parse(requests[0].body), { recipient_email: "guest@example.com", duration: "week" });
});

test("ошибки бэкенда о передаче локализуются, включая собранные по префиксу", async () => {
  const { transfers, api } = clientModules(async (url, init) => {
    if (url.includes("/pets/") && init.method === "POST") {
      return Response.json({ detail: "This pet already has an unfinished transfer" }, { status: 409 });
    }
    if (url.includes("/accept")) {
      return Response.json({ detail: "Only the recipient can accept this transfer" }, { status: 403 });
    }
    if (url.includes("/cancel")) {
      return Response.json({ detail: "Cannot cancel a transfer in status accepted" }, { status: 409 });
    }
    return Response.json({ detail: "Transfer not found" }, { status: 404 });
  });

  await assert.rejects(
    () => transfers.createTransfer(1, { recipient_email: "a@b.co", duration: "week" }),
    (error) => error instanceof api.ApiError && error.message === "У питомца уже есть незавершённая передача",
  );
  await assert.rejects(
    () => transfers.acceptTransfer(2),
    (error) => error instanceof api.ApiError && error.status === 403 && error.message === "Это действие доступно только получателю",
  );
  await assert.rejects(
    () => transfers.cancelTransfer(3),
    (error) => error instanceof api.ApiError && error.status === 409 && error.message === "Статус передачи уже изменился. Обновите страницу",
  );
  await assert.rejects(
    () => transfers.listIncomingTransfers(),
    (error) => error instanceof api.ApiError && error.status === 404 && error.message === "Передача не найдена",
  );
});
