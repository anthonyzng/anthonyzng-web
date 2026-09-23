# Backend

FastAPI + SQLAlchemy 2 (async, asyncpg) + Alembic. Serves the localized content API, the contact
endpoint and admin authentication for owwsolution.com. Run every command below from this
directory (`backend/`).

```bash
python -m uv sync --all-groups                 # creates .venv from uv.lock
cp .env.example .env                           # then fill in the real values (never committed)
docker compose -f ../docker-compose.dev.yml up -d db   # PostgreSQL 17 on 127.0.0.1:5432

python -m uv run alembic upgrade head          # apply migrations to DATABASE_URL
python -m uv run python -m app.seed            # upsert app/seed/content.json (idempotent)
python -m uv run uvicorn app.main:app --reload --port 8000

python -m uv run ruff check .                  # lint
python -m uv run ruff format --check .         # formatting
python -m uv run mypy .                        # strict type check
python -m uv run pytest -q                     # tests against TEST_DATABASE_URL
```

API docs: `http://localhost:8000/api/v1/docs` (development only: switched off with
`APP_ENV=production`). The base path is `/api/v1`; every error response has the shape
`{"error": {"code", "message", "fields"?}}`. With `APP_ENV=production` the app refuses to start on
placeholder or development settings; see `.env.example` and CLAUDE.md section 6.2.

Layout: `app/core` (settings, db, security, rate limiting, errors), `app/models` (SQLAlchemy),
`app/schemas` (Pydantic), `app/services` (content, contact, Turnstile, email, auth),
`app/api/v1` (routers), `app/seed` (content seed), `alembic/` (migrations), `tests/`.
