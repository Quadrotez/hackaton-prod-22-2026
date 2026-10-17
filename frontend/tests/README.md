# Тесты фронтенда

## Юнит-тесты (только Node)
```bash
cd frontend
npm test            # все *.test.mjs; интеграционные скипаются без PETCARE_TEST_PYTHON
```

## Интеграционные тесты (Node + реальный FastAPI)
Поднимают настоящий бекенд на изолированной SQLite (во временной папке) через
`backend-bridge.py` и гоняют реальные модули `frontend/lib/*` против живого API.

Нужен Python 3.12 с зависимостями бекенда:

```bash
# один раз: собрать окружение бекенда
cd backend && uv sync

# запуск (из корня репозитория)
cd frontend
PETCARE_TEST_PYTHON="$(pwd)/../backend/.venv/bin/python" npm run test:integration
```

- Каждый тест получает собственную пустую базу — тесты независимы и параллельны.
- Протокол моста: JSON-строки в stdin/stdout (`{id, path, method, headers, body|form}`),
  multipart-загрузки передаются как `form.files` (base64).
- Стабы только для браузерного: `@/lib/session` (in-memory токен) и иконки `lucide-react`;
  весь остальной код — настоящий, из `frontend/lib`.
- CI: джобы `test:frontend` и `test:frontend:integration` в `.gitlab-ci.yml`.
- Список покрытых сценариев: `SCENARIOS.md` в корне репозитория.
