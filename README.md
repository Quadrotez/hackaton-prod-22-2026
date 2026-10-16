# PetCare

Hackathon project for pet owners, built with Python and FastAPI.

## Requirements

- [uv](https://docs.astral.sh/uv/)
- Python 3.12+

## Setup

```bash
cd backend
uv sync
cp ../.env.example .env
uv run alembic upgrade head
```

Configure `DATABASE_URL`, `JWT_SECRET_KEY`, and `ACCESS_TOKEN_EXPIRE_MINUTES` in `.env` before running migrations. PostgreSQL must be running and the configured database must exist.

This creates `backend/.venv` and installs dependencies pinned in `backend/uv.lock`.

## Run

```bash
cd backend
uv run uvicorn app.main:app --reload
```

The API is available at http://127.0.0.1:8000, interactive docs at http://127.0.0.1:8000/docs.

## Check

```bash
curl http://127.0.0.1:8000/api/v1/health
# {"status":"ok"}
```

Authentication endpoints:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

## Dependencies

Dependencies are declared in `backend/pyproject.toml`. Use `uv add <package>` to add one; this updates `backend/uv.lock`.

## Deploy

Pipeline (`.gitlab-ci.yml`):

- `test:backend` runs pytest on every branch and merge request.
- `build:backend` and `build:frontend` build images with Kaniko and push them to `registry.spirit.t-education.com/hack-led-22/{backend,frontend}:<short-sha>`.
- `deploy` runs only on `master`. It copies `docker-compose.yml` to `/opt/petcare` via Teleport (`tsh scp`) and runs `docker compose pull && up -d` with `TAG=<short-sha>`. `migrate` runs `alembic upgrade head` before `api` starts.

CI/CD variables (Spirit): `SPIRIT_DOCKER_SA_KEY` (File), `DEPLOY_VM`, `DEPLOY_SSH_USER`.

One-time setup on the VM:

1. `/opt/petcare/.env` with `JWT_SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, and `DB_PASSWORD` (used by `db` and `api`).
2. Run the `prepare:docker` job once to log in to the Registry on the VM.
3. In Nginx Proxy Manager (port 8081): Proxy Host `petcare.quadrotez.com` -> `petcare-site:3000`, with a Let's Encrypt certificate.

`docker-compose.yml` joins the external `proxy_network`, which NPM already uses.