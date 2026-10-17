// Общая инфраструктура интеграционных тестов фронтенда:
//  - startBackend(t): поднимает реальный FastAPI через Python-мост (изолированная SQLite)
//    и возвращает fetch-совместимую функцию request(url, options)
//  - client(fetchImpl): загружает НАСТОЯЩИЕ модули frontend/lib/*.ts (транспиляция на лету),
//    стабируются только браузерные вещи: localStorage-сессия и иконки lucide-react
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const backendPython = process.env.PETCARE_TEST_PYTHON || "";

// Мутабельный in-memory аналог lib/session.ts: тест проверяет, что login()
// действительно сохраняет токен.
export function memorySession(initialToken = null) {
  let token = initialToken;
  return {
    getAccessToken: () => token,
    setAccessToken: (value) => {
      token = value;
    },
    clearAccessToken: () => {
      token = null;
    },
    subscribeToAccessToken: () => () => {},
  };
}

// Иконки — значения, а не JSX: подойдут любые функции-заглушки.
const lucideStub = new Proxy({}, { get: () => () => null });

export function client(fetchImpl, { session = memorySession() } = {}) {
  const cache = new Map();
  function load(name) {
    const file = path.join(root, `${name}.ts`);
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} };
    cache.set(file, loaded);
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const resolve = (id) => {
      if (id === "@/lib/session") return session;
      if (id === "lucide-react") return lucideStub;
      return id.startsWith("@/") ? load(id.slice(2)) : nativeRequire(id);
    };
    new Function("require", "module", "exports", "fetch", source)(resolve, loaded, loaded.exports, fetchImpl);
    return loaded.exports;
  }
  return { load, session };
}

// FormData → протокол моста: {fields, files:[{name, filename, b64, type}]}
async function serializeBody(body) {
  if (body === undefined || body === null) return {};
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const fields = {};
    const files = [];
    for (const [name, value] of body.entries()) {
      if (typeof value === "string") {
        fields[name] = value;
      } else {
        const buffer = Buffer.from(await value.arrayBuffer());
        files.push({
          name,
          filename: value.name || name,
          type: value.type || "application/octet-stream",
          b64: buffer.toString("base64"),
        });
      }
    }
    return { form: { fields, files } };
  }
  return { body: typeof body === "string" ? JSON.parse(body) : body };
}

export async function startBackend(t, python = backendPython) {
  if (!python) throw new Error("PETCARE_TEST_PYTHON не задан (см. frontend/tests/README.md)");
  const bridge = fileURLToPath(new URL("../backend-bridge.py", import.meta.url));
  const processApi = spawn(python, ["-B", bridge], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  let serial = 0;
  const pending = new Map();
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  processApi.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-6000);
  });
  createInterface({ input: processApi.stdout }).on("line", (line) => {
    const result = JSON.parse(line);
    if (result.ready) return resolveReady();
    const request = pending.get(result.id);
    pending.delete(result.id);
    request?.resolve(new Response(result.status === 204 ? null : result.body, {
      status: result.status,
      headers: { "content-type": "application/json" },
    }));
  });
  processApi.on("error", rejectReady);
  processApi.on("exit", (code) => {
    const error = new Error(`Backend test process exited ${code}: ${stderr}`);
    rejectReady(error);
    for (const request of pending.values()) request.reject(error);
  });
  t.after(() => {
    processApi.stdin.end();
    processApi.kill("SIGTERM");
  });
  await ready;
  const request = (url, options = {}) =>
    new Promise(async (resolve, reject) => {
      try {
        const payload = await serializeBody(options.body);
        const id = ++serial;
        pending.set(id, { resolve, reject });
        processApi.stdin.write(
          `${JSON.stringify({
            id,
            path: url,
            method: options.method ?? "GET",
            headers: Object.fromEntries(new Headers(options.headers)),
            ...payload,
          })}\n`,
        );
      } catch (error) {
        reject(error);
      }
    });
  return request;
}
