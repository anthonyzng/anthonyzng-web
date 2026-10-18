# Backend notes

Loaded when working under `backend/`. The rules every backend change must follow; the root `CLAUDE.md` holds the project overview, workflow and the pre-commit checks. Details by topic live in `docs/backend/`:

- `docs/backend/auth.md`: admin auth, cookie, CORS, CSRF layers, client IP, rate limiting, two-factor sign-in (TOTP)
- `docs/backend/contact.md`: the contact flow and email providers
- `docs/backend/admin-api.md`: the admin API (collections, ordering, `If-Match`, uploads, CV, messages)
- `docs/backend/files.md`: stored files, the image pipeline, the CV, `GET /files/{id}`
- `docs/backend/tests.md`: what the test suite covers

- **Layout**: `app/core` (settings, db engine/session factory, security, rate limiting, client IP, error envelope, security headers), `app/models` (SQLAlchemy 2 declarative with a naming convention and `TimestampMixin`), `app/schemas` (Pydantic v2: `CamelModel` / `StrictCamelModel`, `Localized[T]`, `Tag`, the public `ContentPayload`, the write models `*In` and their admin read models `*Out` in `admin.py`, request and error models), `app/services` (content, content_admin + the `collections` registry, files, messages, contact, turnstile, email, auth), `app/api/deps.py` + `app/api/v1/*` (routers), `app/seed`, `alembic/` (async env; uses `sqlalchemy.url` from the Alembic config when set, else `DATABASE_URL`, so tests point it at `TEST_DATABASE_URL`), `tests/`. `app/main.py` exposes `create_app(settings)` and, through a module `__getattr__`, `app` (the ASGI entry point for `uvicorn app.main:app`), built on first access: importing the module reads no settings, so the tests (and CI, which has no `backend/.env`) import `create_app` with their own; the lifespan creates the engine and one shared `httpx.AsyncClient`, upserts the admin (`services.auth.ensure_admin_user`) and stores everything in `AppServices` (`core/state.py`) that the dependencies read. Migrations are never run at startup.

- **API surface**: everything under `/api/v1`, no trailing slashes (`redirect_slashes=False`), camelCase JSON, OpenAPI docs at `/api/v1/docs` and the schema at `/api/v1/openapi.json`, both switched off when `APP_ENV=production`. Every non-2xx response, on every route, is `{"error": {"code", "message", "fields"?}}` (`core/errors.py` replaces FastAPI's default handlers; codes: `validation_error` 422, `not_found` 404, `method_not_allowed` 405, `payload_too_large` 413, `turnstile_failed` 400, `totp_invalid` 400, `wrong_password` 400, `invalid_credentials` 401, `unauthorized` 401, `forbidden` 403, `conflict` 409, `precondition_failed` 412, the upload refusals 422 (`file_missing`, `file_empty`, `file_too_large`, `file_type`, `image_unreadable`, `image_too_many_pixels`, `image_placeholder`, each with the text in `fields.file`), `rate_limited` 429 + `Retry-After`, `internal_error` 500, `service_unavailable` 503). `message` (and a `fields` text) is developer-facing; the frontend maps `code` to its own i18n strings. An unhandled exception is answered by `ServerErrorEnvelopeMiddleware` (`core/middleware.py`, innermost) with the 500 envelope, so it still passes through CORS and the security headers (a cross-origin caller sees a server error, not a network failure), then re-raised so the server logs the traceback. Routes: `GET /health` (`SELECT 1`), `GET /content?locale=en|zh-Hant` (default `en`; every string resolved for that locale, the sections `hero`, `statement`, `experience`, `projects`, `skills`, `tools`, `contact`, `archive` (migration `0005_tools_archive` added the tools and archive tables and the school / certification `url`; `0006_hero_texts` added `hero_roles` and, in a database that already holds content, the hero and "In brief" site texts with the words the page showed before; an empty database is left to the seed; a missing site text reads as ""), plus `projects[].image` `{url, width, height}` and `cv` `{url, filename, size, updatedAt}`, each `null` when absent; compact UTF-8 body, strong sha256 `ETag`, `Cache-Control: public, max-age=60`, 304 on a matching `If-None-Match`; the rendered document is kept per locale in `AppServices.content_cache` (`ContentCache`, `services/content.py`) for 30 s, a miss built once however many requests wait for it, and every admin write (a dependency on the admin router) clears it, so edits show at once; a build overtaken by a write is served but not kept), `GET /files/{id}` (see `docs/backend/files.md`), `POST /contact` (202), `POST /auth/login`, `POST /auth/login/totp`, `POST /auth/logout` (204), `GET /auth/me`, and the admin API under `/admin` (see `docs/backend/admin-api.md`). Lists are ordered `sort_order ASC, slug ASC`; a slug becomes `id` in the payload. Every response also carries `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`, and every response under `/api/v1/admin` and `/api/v1/auth` (errors included) `Cache-Control: no-store` unless it sets its own (`SecurityHeadersMiddleware`, `core/middleware.py`); HSTS is Caddy's job. `RequestBodyLimitMiddleware` (same file) caps every request body at 64 KiB (`MAX_REQUEST_BODY_BYTES`; the largest public request is about 20 KB) except where `route_limits` says otherwise (full-match path patterns set in `main.py`, first match wins: `PUT /admin/content/projects/<slug>/image` 9 MiB = the 8 MiB image limit + 1 MiB of multipart framing, `PUT /admin/cv` 11 MiB, and every other `/admin/content/…` write 512 KiB, since a maximal bilingual experience entry is 80–100 KB of JSON); a declared `Content-Length` over the cap is answered 413 before routing (no rate-limit slot, no database work), and a chunked body is counted as it streams and cut off with the same 413; both carry `Connection: close`, so the server drops the rest of the body. It sits inside CORS and the security headers, so the 413 carries both.

- **Settings** (`core/config.py`; field name = env var; `backend/.env` is read automatically; keep `backend/.env.example` in sync): `APP_ENV` (`development` | `test` | `production`), `DATABASE_URL`, `TEST_DATABASE_URL` (pytest only), `JWT_SECRET` (at least 32 characters), `IP_HASH_SECRET` (at least 32 characters; the HMAC key for contact-message IP hashes; changing it makes old hashes unmatchable), `TOTP_ENCRYPTION_KEY` (at least 32 characters; encrypts the admin's TOTP secret; changing it makes a stored secret unreadable, which the shell reset recovers from), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CONTACT_TO_EMAIL`, `EMAIL_FROM` (default `noreply@owwsolution.com`), `EMAIL_PROVIDER` (`console` | `resend`; `resend` requires `RESEND_API_KEY`), `TURNSTILE_SECRET_KEY`, `CORS_ORIGINS` (comma-separated exact origins, `*` rejected), `TRUSTED_PROXY` (default `false`). For a one-off run, override in the environment instead of editing `.env` (environment variables win). Settings errors never echo input values (`hide_input_in_errors=True`), so a failed start cannot print a secret. With `APP_ENV=production` the process refuses to start (`_refuse_unsafe_production`, every problem listed, no value shown) on a `change-me` placeholder in `JWT_SECRET`, `IP_HASH_SECRET`, `TOTP_ENCRYPTION_KEY` or `ADMIN_PASSWORD`, an `ADMIN_PASSWORD` under 12 characters, any two of `JWT_SECRET`, `IP_HASH_SECRET`, `TOTP_ENCRYPTION_KEY` equal, a Cloudflare test Turnstile secret, any `EMAIL_PROVIDER` but `resend`, or an empty `CORS_ORIGINS`.

- **Seed** (`app/seed/`): `content.json` is the site's initial content in the storage shapes (`translations` objects, tag strings or `{"en","zh-Hant"}` term objects, `YYYY-MM` dates); rows are validated by the write models and mapped by the collection registry. `seed_content` upserts every row by slug in one transaction (`INSERT … ON CONFLICT (slug) DO UPDATE`, `updated_at = now()`; a row without `sortOrder` takes its position in the file), never deletes a row and keeps a project's image, unless the file makes that project a placeholder (which cannot have one): then the image is dropped, and cover images no project points at are deleted. The admin panel is the source of truth, so `content.json` is not kept in step with it and only bootstraps an empty database (development, a new server): `python -m app.seed` refuses a database that already holds content, because it would put the file's version back over every edited row; `--force` seeds anyway.

## Stack

| Layer      | Choice |
|------------|--------|
| Backend    | Python 3.13 + FastAPI, SQLAlchemy 2.x (async, asyncpg), Alembic migrations, Pydantic v2; dependencies managed with uv (`pyproject.toml` + committed `uv.lock`) |
| Database   | PostgreSQL 17, the platform's shared instance: database `anthonyzng_web`, roles `anthonyzng_web_owner` (migrations) and `anthonyzng_web_app` (the backend); bilingual content stored as one JSONB `translations` column per row (see Conventions below) |
| Admin auth | Single admin account, Argon2 password hash, JWT in httpOnly cookie, login rate limiting, optional TOTP second factor (authenticator app; `docs/backend/auth.md`). Admin UI at `owwsolution.com/admin` |
| Contact    | Cloudflare Turnstile (bot protection) + Resend (email from `noreply@owwsolution.com`). Every message is also stored in the DB. Recipient comes from env var `CONTACT_TO_EMAIL` (value kept in `CLAUDE.local.md`, never committed) |

## Conventions

- Type hints everywhere (`mypy --strict` must pass); Pydantic schemas for all request/response bodies, camelCase on the wire (`CamelModel` in `app/schemas/common.py`), snake_case in Python.
- All schema changes go through Alembic migrations (`alembic revision --autogenerate`); `tests/test_migrations.py` fails when the models and the migrations drift apart.
- Config comes from environment variables only (pydantic-settings, `app/core/config.py`); secrets are `SecretStr` and never logged.
- Localised content storage model: every translatable row carries one JSONB column `translations` shaped `{"en": {...}, "zh-Hant": {...}}`; both locales are required and validated by the Pydantic generic `Localized[T]`. Tag chips are a JSONB array whose items are either a plain string (a proper noun, never translated) or a `{"en": "...", "zh-Hant": "..."}` object (a translated term). Untranslated facts (company, company_url, school, certification name, the `url` of a school, certification, tool or archive entry, tool name, archive month, href, display) are ordinary columns. Dates are `YYYY-MM` strings (`end_month` NULL = present). Slugs (`^[a-z][a-zA-Z0-9_-]{0,63}$`) are the frontend's ids and the natural key of every content table.
- Async everywhere (SQLAlchemy async sessions, asyncpg, httpx.AsyncClient); `ruff check` and `ruff format --check` must pass; tests run against a real PostgreSQL, never SQLite.

## Files

```
anthonyzng-web/
└── backend/
    ├── CLAUDE.md               # backend rules, loaded when working under backend/
    ├── Dockerfile              # multi-stage: uv sync → slim runtime, non-root, uvicorn on :8000
    ├── pyproject.toml          # uv-managed project; uv.lock is committed
    ├── .env.example            # every backend env var, placeholder values only
    ├── alembic.ini
    ├── alembic/                # async env.py + versions/
    ├── tests/                  # pytest against a real PostgreSQL (TEST_DATABASE_URL)
    └── app/
        ├── main.py             # create_app() + lifespan; `app` for uvicorn (built on first access)
        ├── db_roles.py         # `python -m app.db_roles`: checks the backend's least-privilege database role (run by `migrate`)
        ├── admin_totp.py       # `python -m app.admin_totp status|reset`: the admin's two-factor sign-in from a shell
        ├── api/                # deps.py + v1/ routers (health, content, contact, auth, files, admin)
        ├── models/             # SQLAlchemy models (content, contact_message, admin_user, stored_file)
        ├── schemas/            # Pydantic schemas (public payload, write models, admin, requests, errors)
        ├── services/           # content, content_admin, collections, files, messages, contact, turnstile, email, auth
        ├── seed/               # content.json + `python -m app.seed` (bootstraps an empty database)
        └── core/               # config, db, security, rate_limit, client_ip, errors, middleware
```

## Commands

```bash
# Dev database (from the repo root; credentials in the git-ignored root .env, see .env.example)
docker compose -f docker-compose.dev.yml up -d db   # PostgreSQL 17 on 127.0.0.1:5432, plus the *_test database (project anthonyzng-web-dev, volume anthonyzng-web_pgdata: never `down -v`)

# Backend (run inside backend/; uv is invoked as `python -m uv`, plain `uv` may not be on PATH)
python -m uv sync --all-groups                 # create .venv from uv.lock (runtime + dev tools)
python -m uv run alembic upgrade head          # apply migrations to DATABASE_URL (never run at startup)
python -m uv run python -m app.seed            # load app/seed/content.json into an empty DATABASE_URL (refuses one with content; --force overwrites)
python -m uv run uvicorn app.main:app --reload --port 8000   # http://localhost:8000/api/v1, docs at /api/v1/docs (the "backend" entry in .claude/launch.json runs it too)
python -m uv run ruff check .                  # lint
python -m uv run ruff format --check .         # formatting
python -m uv run mypy .                        # strict type check
python -m uv run pytest -q                     # tests against TEST_DATABASE_URL (schema rebuilt by the session fixture)
python -m uv run alembic revision --autogenerate -m "describe change"   # after a model change
```
