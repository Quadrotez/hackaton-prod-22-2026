# PetCare

PetCare — приложение для владельцев домашних животных, которое объединяет профили питомцев, историю кормления, запасы кормов, медицинские записи, лекарства и календарь ухода в одном месте.

Проект разработан как hackathon MVP и состоит из:

- backend API на FastAPI;
- frontend-приложения на Next.js;
- PostgreSQL для production-хранения данных;
- файлового хранилища для фотографий;
- интеграции Yandex AI для анализа фотографий ветеринарских документов;
- календаря с экспортом в `.ics` и подписочной ссылкой;
- автоматических тестов и Docker Compose-контура.

> PetCare — организационный инструмент, а не система ветеринарной диагностики. Приложение не ставит диагнозы и не назначает лечение.

## Как проверить за пару минут

- **Деплой:** https://petcare.quadrotez.com — приложение доступно (HTTP 200).
- **Демо-вход:** нажмите «Войти в демо» на странице входа либо войдите как
  `demo@quadrotez.com` / `demo`. Аккаунт с данными создаётся автоматически при
  каждом деплое (job `demo:account`).
- **Документация API (Swagger UI):** https://petcare.quadrotez.com/api/docs
  (OpenAPI-схема: https://petcare.quadrotez.com/openapi.json).
- **Тесты и линтеры:** каждый пайплайн GitLab CI прогоняет backend-, frontend- и
  интеграционные тесты, а также `ruff` и `eslint`. На вкладке **Tests** пайплайна
  виден отчёт pytest, в merge request — покрытие (cobertura), в артефактах —
  `report.xml`, `coverage.xml` и «Swagger UI».
- **Отчёт о покрытых сценариях:** [`SCENARIOS.md`](SCENARIOS.md:1).

## Возможности

### Аккаунт и безопасность

- регистрация по email и паролю;
- вход с JWT access token;
- срок действия токена задаётся конфигурацией;
- безопасное хеширование паролей Argon2;
- получение и редактирование собственного профиля;
- смена пароля с проверкой текущего пароля;
- загрузка аватара;
- изоляция данных пользователей на backend-уровне.

### Питомцы

Для каждого питомца можно хранить:

- имя;
- вид;
- пол;
- породу;
- дату рождения;
- приблизительный возраст;
- текущий вес;
- фотографию;
- историю изменения веса.

Питомца можно передать другому пользователю по email: владелец создаёт приглашение
(срочное или временное, со сроком), получатель принимает или отклоняет, а также
возможен запрос возврата питомца с подтверждением владельцем.

### Кормление и запасы

- каталог кормов;
- пищевые характеристики: белки, жиры, углеводы и калорийность;
- общий и остаточный запас в граммах;
- история кормлений;
- количество и время кормления;
- оценка предпочтения и переносимости;
- заметки о реакции питомца;
- контроль недостаточного остатка корма.

Исторические кормления сохраняются даже после удаления записи из каталога кормов.

### Здоровье

Для питомца доступны отдельные медицинские разделы:

- симптомы;
- аллергии;
- беременность;
- вакцинации;
- лекарства;
- расписание дозировок;
- отметки фактического приёма лекарств;
- визиты к ветеринару;
- темы визитов и связи между визитами;
- пользовательские параметры измерений;
- история измерений;
- агрегированный обзор и сводка здоровья.

### Календарь

Календарь собирает события из медицинских записей:

- запланированные визиты;
- вакцинации;
- дозы лекарств;
- ближайшие незавершённые события.

Поддерживаются:

- фильтрация по питомцу;
- фильтрация по типу события;
- диапазон дат;
- локальные временные зоны;
- экспорт в формат `.ics`;
- подписочная ссылка для Google Calendar, Apple Calendar и Outlook;
- отзыв и перевыпуск секретной ссылки.

### Анализ ветеринарских документов

Можно отправить фотографию ветеринарского документа и дополнительный контекст. Система:

1. проверяет размер файла;
2. проверяет фактический формат изображения;
3. отправляет изображение в Yandex AI;
4. получает строго типизированный JSON;
5. возвращает извлечённые поля и предупреждения.

Из документа извлекаются:

- имя животного;
- дата визита;
- причина обращения;
- стоимость ветеринарского приёма;
- имя ветеринара;
- профессия или должность специалиста;
- название или информация о клинике;
- явно указанные рекомендации после визита.

Фотография имеет приоритет над текстовым контекстом. Если значение нельзя определить достоверно, возвращается `null`.

## Архитектура

```text
Браузер
   |
   v
Next.js frontend
   |
   | HTTP/JSON, multipart, iCalendar
   v
FastAPI backend
   |-- JWT-аутентификация
   |-- SQLAlchemy и Alembic
   |-- PostgreSQL
   |-- файловое хранилище изображений
   |-- Yandex AI API
   v
PostgreSQL + Docker volumes
```

Backend является источником бизнес-правил и проверок доступа. Frontend не считается доверенной стороной: идентификатор владельца не принимается от клиента для определения прав доступа.

Основные каталоги:

| Каталог | Назначение |
|---|---|
| [`backend/app/api`](backend/app/api) | HTTP-маршруты и зависимости FastAPI |
| [`backend/app/core`](backend/app/core) | конфигурация и безопасность |
| [`backend/app/db`](backend/app/db) | подключения и сессии базы данных |
| [`backend/app/models`](backend/app/models) | SQLAlchemy-модели |
| [`backend/app/schemas`](backend/app/schemas) | Pydantic-схемы запросов и ответов |
| [`backend/app/services`](backend/app/services) | бизнес-логика |
| [`backend/app/integrations`](backend/app/integrations) | внешние интеграции, включая LLM |
| [`backend/tests`](backend/tests) | backend-тесты |
| [`frontend/app`](frontend/app) | страницы Next.js |
| [`frontend/components`](frontend/components) | переиспользуемые frontend-компоненты |

Подробная техническая спецификация находится в [`RFC.md`](RFC.md:1).

## API

API использует префикс `/api/v1`.

### Проверка доступности

```text
GET /api/v1/health
```

Ответ:

```json
{"status":"ok"}
```

### Аутентификация

| Метод | Endpoint | Назначение |
|---|---|---|
| `POST` | `/api/v1/auth/register` | регистрация |
| `POST` | `/api/v1/auth/login` | вход |
| `GET` | `/api/v1/auth/me` | текущий пользователь |
| `PATCH` | `/api/v1/auth/me` | изменение профиля |
| `PATCH` | `/api/v1/auth/me/password` | смена пароля |
| `POST` | `/api/v1/auth/me/avatar` | загрузка аватара |
| `GET` | `/api/v1/auth/me/avatar` | получение аватара |

### Питомцы

| Метод | Endpoint | Назначение |
|---|---|---|
| `POST` | `/api/v1/pets/` | создать питомца |
| `GET` | `/api/v1/pets/` | список питомцев |
| `GET` | `/api/v1/pets/{pet_id}` | получить питомца |
| `PATCH` | `/api/v1/pets/{pet_id}` | изменить питомца |
| `DELETE` | `/api/v1/pets/{pet_id}` | удалить питомца |
| `POST` | `/api/v1/pets/{pet_id}/photo` | загрузить фотографию |
| `GET` | `/api/v1/pets/{pet_id}/photo` | получить фотографию |
| `GET` | `/api/v1/pets/{pet_id}/weight` | история веса |

### Передача питомца

| Метод | Endpoint | Назначение |
|---|---|---|
| `POST` | `/api/v1/pets/{pet_id}/transfers` | создать приглашение на передачу |
| `GET` | `/api/v1/pets/{pet_id}/transfers` | история передач питомца |
| `GET` | `/api/v1/pets/{pet_id}/transfers/current` | незавершённая передача питомца |
| `GET` | `/api/v1/transfers/incoming` | входящие приглашения |
| `GET` | `/api/v1/transfers/received` | принятые питомцы |
| `GET` | `/api/v1/transfers/outgoing` | исходящие передачи |
| `POST` | `/api/v1/transfers/{transfer_id}/accept` | принять передачу |
| `POST` | `/api/v1/transfers/{transfer_id}/decline` | отклонить передачу |
| `POST` | `/api/v1/transfers/{transfer_id}/cancel` | отозвать приглашение |
| `POST` | `/api/v1/transfers/{transfer_id}/return` | запросить возврат |
| `POST` | `/api/v1/transfers/{transfer_id}/cancel-return` | отменить запрос возврата |
| `POST` | `/api/v1/transfers/{transfer_id}/confirm-return` | подтвердить возврат |

### Кормление и корма

| Метод | Endpoint | Назначение |
|---|---|---|
| `POST` | `/api/v1/pets/{pet_id}/feeding-records` | добавить кормление |
| `GET` | `/api/v1/pets/{pet_id}/feeding-records` | история кормления |
| `GET` | `/api/v1/pets/{pet_id}/feeding-records/suggestions` | рекомендации по истории |
| `PATCH` | `/api/v1/pets/{pet_id}/feeding-records/{record_id}` | изменить запись |
| `DELETE` | `/api/v1/pets/{pet_id}/feeding-records/{record_id}` | удалить запись |
| `POST` | `/api/v1/foods` | создать корм |
| `GET` | `/api/v1/foods` | список кормов |
| `PATCH` | `/api/v1/foods/{food_id}` | изменить корм |
| `DELETE` | `/api/v1/foods/{food_id}` | удалить корм |

### Здоровье и календарь

Медицинские endpoints сгруппированы под `/api/v1/pets/{pet_id}` и включают ресурсы `health`, `symptoms`, `allergies`, `pregnancy`, `vaccinations`, `medications`, `visits` и `measurement-parameters`.

Календарь доступен через:

- `GET /api/v1/calendar/events`;
- `GET /api/v1/calendar/upcoming`;
- `GET /api/v1/calendar/export.ics`;
- `GET/POST/DELETE /api/v1/calendar/feed`;
- `GET /api/v1/calendar/feed/{token}.ics`.

### Анализ документов

```text
POST /api/v1/pets/{pet_id}/vet-documents/analyze
```

Multipart-поля:

- `image` — обязательный файл PNG, JPEG или WebP;
- `pet_context` — необязательный текст до 4000 символов.

Полная интерактивная документация доступна в Swagger UI по адресу `/docs` после
запуска backend (на деплое — https://petcare.quadrotez.com/api/docs, схема —
https://petcare.quadrotez.com/openapi.json).

## Требования

- Python 3.12+;
- [`uv`](https://docs.astral.sh/uv/);
- Node.js и npm или Bun для frontend;
- Docker и Docker Compose — для контейнерного запуска;
- PostgreSQL — для локального запуска backend без Docker.

## Конфигурация

Скопируйте пример конфигурации:

```bash
cp .env.example .env
```

Основные переменные:

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | URL базы данных |
| `JWT_SECRET_KEY` | секрет подписи JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | срок действия access token в минутах |
| `MEDIA_DIR` | каталог хранения изображений |
| `MAX_UPLOAD_SIZE_BYTES` | максимальный размер загрузки |
| `YANDEX_API_KEY` | ключ Yandex AI |
| `YANDEX_FOLDER_ID` | каталог Yandex Cloud |
| `YANDEX_MODEL` | имя модели анализа документов |

Не добавляйте `.env` с реальными секретами в Git. Файл [` .env.example`](.env.example) используется только как шаблон.

## Локальный запуск backend

Установите зависимости и подготовьте базу:

```bash
cd backend
uv sync
uv run alembic upgrade head
```

Запустите API:

```bash
uv run uvicorn app.main:app --reload
```

После запуска:

- API: http://127.0.0.1:8000;
- Swagger UI: http://127.0.0.1:8000/docs;
- OpenAPI JSON: http://127.0.0.1:8000/openapi.json;
- healthcheck: http://127.0.0.1:8000/api/v1/health.

## Локальный запуск frontend

В отдельном терминале:

```bash
cd frontend
npm install
npm run dev
```

Frontend будет доступен по адресу http://localhost:3000.

Для backend разрешён origin `http://localhost:3000`.

## Запуск тестов

Полный отчёт по покрытым сценариям: [`SCENARIOS.md`](SCENARIOS.md). Все тесты
запускаются из CI на каждый коммит и MR.

Backend-тесты (интеграционные, с отчётом покрытия) запускаются из каталога [`backend`](backend:1):

```bash
cd backend
uv run pytest --cov=app --cov-report=term
```

Тестовый контур использует изолированную SQLite-базу и отдельный каталог временных медиафайлов. Проверяются:

- регистрация и JWT-аутентификация;
- хеширование и смена паролей;
- ownership и защита от доступа к чужим данным;
- питомцы, фотографии и история веса;
- кормление, каталог и остатки;
- медицинские записи, лекарства и расписания, измерения;
- календарь и iCalendar;
- передача питомца другому пользователю;
- анализ ветеринарных документов;
- миграции.

Frontend-тесты находятся в [`frontend/tests`](frontend/tests) (юнит — `npm test`,
интеграционные против реального FastAPI — `npm run test:integration`,
подробности — [`frontend/tests/README.md`](frontend/tests/README.md)).

Линтеры (запускаются из пайплайна вместе с тестами):

```bash
cd backend && uv run ruff check .   # backend
cd frontend && npm run lint         # frontend
```

## Запуск через Docker Compose

Production-подобный контур описан в [`docker-compose.yml`](docker-compose.yml:1). В нём используются:

- PostgreSQL 16;
- одноразовый контейнер миграций;
- backend API;
- Next.js frontend;
- volumes для базы и медиа;
- внешняя сеть `proxy_network` для reverse proxy.

Для deployment необходимо задать `TAG` и подготовить внешний `.env` с секретами:

```bash
TAG=<image-tag> docker compose up -d
```

Миграции запускаются отдельным сервисом до старта API. API использует внутреннее имя сервиса базы данных, а frontend обращается к backend через Docker-сеть.

Для обычной локальной разработки без registry удобнее запускать backend и frontend командами из разделов выше.

## CI/CD

Pipeline описан в [`.gitlab-ci.yml`](.gitlab-ci.yml:1) и включает:

1. запуск backend-тестов (junit + cobertura-покрытие);
2. запуск frontend юнит- и интеграционных тестов;
3. линтеры backend (`ruff`) и frontend (`eslint`);
4. прогон Alembic-миграций против настоящего PostgreSQL (upgrade → downgrade → upgrade);
5. экспорт OpenAPI-схемы и статического Swagger UI (артефакт пайплайна);
6. сборку и публикацию backend/frontend-образов в registry;
7. deployment на production из ветки `master`; миграции применяются в одноразовом
   контейнере до перезапуска `api`/`site`, поэтому падение миграции не уводит прод вниз;
8. создание демо-аккаунта.

Тесты и линтеры идут в стадии `test` до `build`/`deploy`: красный результат
блокирует сборку и выкатку.

Секреты CI и production-хоста передаются через переменные GitLab и внешний `.env`, а не через исходный код.

## Безопасность

PetCare придерживается следующих правил:

- пароль не хранится в открытом виде;
- JWT-секрет не хранится в репозитории;
- защищённые endpoints требуют Bearer-токен;
- владелец определяется из проверенного JWT;
- пользователь не может получить чужого питомца или связанные записи;
- загружаемые изображения проверяются по содержимому;
- размер загрузки ограничен конфигурацией;
- feed-токен календаря хранится в базе только в виде SHA-256-хеша;
- ошибки сервера не раскрывают traceback клиенту;
- LLM не должна ставить диагнозы и выдумывать назначения.

## Хранение данных

Production использует PostgreSQL и Docker volume [`pgdata`](docker-compose.yml:73). Изображения хранятся в volume [`mediadata`](docker-compose.yml:74).

Схема базы изменяется только через Alembic-миграции. Перед запуском API в контейнерном окружении выполняется команда `alembic upgrade head`.

Для production рекомендуется регулярно резервировать:

- PostgreSQL volume;
- media volume;
- конфигурацию deployment без раскрытия секретов.

## Структура документации

- [`README.md`](README.md:1) — быстрый старт, возможности и эксплуатация;
- [`RFC.md`](RFC.md:1) — подробная спецификация требований, архитектуры и решений;
- [`backend/README.md`](backend/README.md) — если добавлена backend-специфичная документация;
- [`frontend/README.md`](frontend/README.md) — описание frontend-проекта.

## Ограничения текущей версии

- access token не имеет отдельного механизма отзыва до истечения срока;
- feed-ссылка является bearer-secret и должна считаться чувствительной;
- синхронный вызов LLM может занимать worker на время запроса;
- медиа хранятся в локальном volume и требуют отдельного backup-процесса;
- SQLite в тестах не заменяет полноценные PostgreSQL integration-тесты;
- анализ документа возвращает данные для проверки пользователем, но не создаёт медицинскую запись автоматически.

## Лицензия

Проект создан в рамках hackathon-разработки. Условия распространения определяются правилами хакатона и настройками репозитория.
