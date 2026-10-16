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

# Deploy
`docker-compose.yml` for Nginx Proxy Manager