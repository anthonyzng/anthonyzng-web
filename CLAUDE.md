# CLAUDE.md

Guidance for Claude Code (and any sub-agent) working in this repository.

> Items marked `TBD` are open decisions. Do not guess them; ask the owner.

---

## 1. Project Overview

**anthonyzng-web** is the personal professional showcase website of Anthony Ng, served at **owwsolution.com**.
GitHub repo: **`anthonyzng/anthonyzng-web`** (public).

The site must communicate the owner's three roles:
- Full Stack Software Developer
- AI Developer
- Assistant Manager, Software Development

### Features
- Work experience timeline
- Projects portfolio (details, tech stack, links, images)
- Skills / tech stack
- Contact form (with bot protection)
- Downloadable CV (PDF)
- **Bilingual: English + Traditional Chinese** (language switcher, content stored per locale)
- **Dark / light mode** (follows system by default, user toggle persisted)
- SEO (meta tags, Open Graph, sitemap, `hreflang`, structured data)
- Analytics
- **Admin panel** to manage experience, projects, skills, and CV content (content lives in the database)

### Home page requirements (non-negotiable)
- **Scroll-driven animations**: elements animate in sync with scroll progress, not just a one-time fade-in.
- **Parallax scrolling**: layered elements moving at different speeds.
- Smooth (target 60fps), honours `prefers-reduced-motion`, degrades gracefully on mobile and older browsers.

### Design direction
Minimal, modern, professional. Reference style: editorial portfolios such as those collected on Awwwards and a1.gallery.
- Generous whitespace, strong typography (grotesk sans such as Inter / Neue Montreal, plus a mono accent such as IBM Plex Mono)
- Restrained palette: neutral base plus one accent colour
- Motion is tasteful: layered parallax on individual elements, text reveals tied to scroll, pinned sections for storytelling (e.g. the experience timeline)
- Use the `ui-ux-pro-max` skill for design system decisions

---

## 2. Architecture

Each tier runs in its **own Docker container** so they can be scaled or moved independently.

```
                       Internet
                          │
          owwsolution.com │ api.owwsolution.com
                ┌─────────▼─────────┐
                │   proxy (Caddy)    │  auto-HTTPS, routing by host
                └───┬───────────┬───┘
                    │           │
        ┌───────────▼──┐   ┌────▼──────────┐
        │  frontend     │   │  backend       │
        │  React SPA    │   │  FastAPI       │
        │  (static)     │   │                │
        └──────────────┘   └────┬──────────┘
                                │
                          ┌─────▼──────┐
                          │ PostgreSQL  │  named volume
                          └────────────┘
```

- Hosting: **GCP Compute Engine VM** running Docker + Docker Compose. **Every service (frontend, backend, database, proxy, and any future service) runs in its own container**; nothing is installed directly on the host besides Docker.
- Domains: `owwsolution.com` + `www` → frontend; `api.owwsolution.com` → backend. DNS not yet configured.
- Database backups: not required for now.

### Tech stack

| Layer      | Choice |
|------------|--------|
| Frontend   | React + TypeScript + Vite |
| Styling    | Tailwind CSS |
| Animation  | GSAP + ScrollTrigger (scroll-driven, pinning, parallax), Lenis (smooth scroll) |
| i18n       | react-i18next; locales `en`, `zh-Hant` |
| Routing    | React Router |
| Backend    | Python 3.13 + FastAPI, SQLAlchemy 2.x (async, asyncpg), Alembic migrations, Pydantic v2; dependencies managed with uv (`pyproject.toml` + committed `uv.lock`) |
| Database   | PostgreSQL 17; bilingual content stored as one JSONB `translations` column per row (see section 5) |
| Proxy/TLS  | Caddy (automatic Let's Encrypt certificates) |
| CI/CD      | GitHub Actions: lint/test → build images → push to GHCR → deploy to GCP VM over SSH |
| Admin auth | Single admin account, Argon2 password hash, JWT in httpOnly cookie, login rate limiting (TOTP 2FA later). Admin UI at `owwsolution.com/admin` |
| Contact    | Cloudflare Turnstile (bot protection) + Resend (email from `noreply@owwsolution.com`). Every message is also stored in the DB. Recipient comes from env var `CONTACT_TO_EMAIL` (value kept in `CLAUDE.local.md`, never committed) |
| Analytics  | Self-hosted Umami in its own container (own database in the same PostgreSQL instance) |

---

## 3. Repository Layout

```
anthonyzng-web/
├── CLAUDE.md
├── README.md
├── docker-compose.yml          # production stack (Phase 6)
├── docker-compose.dev.yml      # local dev: the `db` service (PostgreSQL 17 on 127.0.0.1:5432)
├── .env.example                # root Compose variables (Postgres credentials), placeholder values only
├── .mcp.json                   # GitHub MCP server (token read from env var GITHUB_PAT)
├── .claude/
│   ├── settings.json           # project plugins
│   └── commands/do_pr.md       # /do_pr command
├── db/
│   └── init/                   # Postgres init scripts (creates the `*_test` database on first start)
├── frontend/
│   ├── Dockerfile              # multi-stage: build → static serve (Phase 6)
│   ├── .env.example            # VITE_API_BASE_URL, VITE_TURNSTILE_SITE_KEY (public build-time values)
│   └── src/
│       ├── api/                # fetch client, zod schemas, /content and /contact calls
│       ├── components/         # incl. ContactForm, FormField
│       ├── content/            # static content modules, resolved shape, useContent + ContentProvider
│       ├── sections/           # Hero, Experience, Projects, Skills, Contact
│       ├── animations/         # scroll / parallax hooks
│       ├── i18n/               # UI string translations
│       ├── admin/              # admin panel pages (Phase 5)
│       └── pages/
├── backend/
│   ├── Dockerfile              # (Phase 6)
│   ├── pyproject.toml          # uv-managed project; uv.lock is committed
│   ├── .env.example            # every backend env var, placeholder values only
│   ├── alembic.ini
│   ├── alembic/                # async env.py + versions/
│   ├── tests/                  # pytest against a real PostgreSQL (TEST_DATABASE_URL)
│   └── app/
│       ├── main.py             # create_app() + lifespan; `app` for uvicorn
│       ├── api/                # deps.py + v1/ routers (health, content, contact, auth)
│       ├── models/             # SQLAlchemy models
│       ├── schemas/            # Pydantic schemas (public payload, write models, requests, errors)
│       ├── services/           # content, contact, turnstile, email, auth
│       ├── seed/               # content.json + `python -m app.seed`
│       └── core/               # config, db, security, rate_limit, client_ip, errors, middleware
├── proxy/
│   └── Caddyfile
└── .github/workflows/
```

---

## 4. Development Workflow (MUST follow)

### 4.1 Ask first
For every request from the owner: if anything is unclear, ambiguous, or missing detail, **ask before executing**.

### 4.2 Per-task flow

```
Owner assigns a task
   → clarify if needed
   → check the current branch
        • on main      → create a new branch: ddmmyyyy_hhmmss_by_claude_anthony
        • not on main  → keep working on the current branch
   → implement
   → code review the diff (code-review skill); fix every finding and re-review until clean
   → commit
   → push to the current branch
```

- Branch name uses local time at creation, e.g. `21092026_143005_by_claude_anthony`.
  PowerShell: `git checkout -b "$(Get-Date -Format 'ddMMyyyy_HHmmss')_by_claude_anthony"`
- **Never commit directly to `main`** (the one exception is the initial repository commit).
- The same branch keeps receiving commits and pushes across tasks until the owner runs **`/do_pr`**.
- `/do_pr` (see `.claude/commands/do_pr.md`): opens a PR from the current branch into `main` via the GitHub MCP server, squash-merges it, and syncs local `main`. The next task then starts a new branch.
- Merges into `main` trigger automatic deployment to the GCP VM.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`, `test:`).
- GitHub operations (PRs, merges, repo metadata) go through the **GitHub MCP server**. Plain `git` over SSH is used for commit, push, and pull.

### 4.3 GitHub account
- Use **only** the GitHub account `anthonyzng`. Never use `API-Anthony-Ng`.
- SSH uses `~/.ssh/id_ed25519_anthonyzng` (already configured in `~/.ssh/config`).
- GitHub MCP (`.mcp.json`) authenticates with a fine-grained PAT scoped to this repo only, read from the Windows user env var `GITHUB_PAT`. Never print, log, or commit its value. When it expires (90 days), ask the owner to create a new one.

### 4.4 Security
- **Before creating, using, or storing any key, token, password, or credential, ask the owner for authorisation.** This covers GitHub tokens, GCP service accounts, SSH deploy keys, GitHub Actions secrets, DNS changes, firewall rules, and API keys.
- **Any task that involves personal data (emails, phone numbers, addresses, ID numbers, CV details, contact-form submissions, etc.) requires the owner's approval before acting**, including reading, storing, moving, publishing, or committing it.
- This repo is **public**. This file is committed, so never put private details in it; use `CLAUDE.local.md` (git-ignored) for those.
- Never commit secrets. They live in `.env` (git-ignored) or GitHub Actions secrets; keep `.env.example` in sync with placeholders.

---

## 5. Coding Conventions

### General
- Code, comments, commit messages, and docs are written in **English**.
- User-facing content is available in both `en` and `zh-Hant`. Never hard-code UI strings; use i18n keys.

### Frontend
- TypeScript strict mode. Function components + hooks, one component per file, PascalCase filenames.
- Animation logic lives in `src/animations/` as reusable hooks (`useParallax`, `useScrollReveal`, ...). Sections consume hooks rather than wiring GSAP inline.
- Use `gsap.context()` / `useGSAP` and always clean up ScrollTriggers on unmount.
- Always honour `prefers-reduced-motion`.
- Animate only `transform` and `opacity`.
- Mobile-first; verify at 375px, 768px, 1280px+ (use the `webapp-testing` skill).
- Accessibility: semantic HTML, alt text, keyboard navigation, WCAG AA contrast in both themes.

### Backend
- Type hints everywhere (`mypy --strict` must pass); Pydantic schemas for all request/response bodies, camelCase on the wire (`CamelModel` in `app/schemas/common.py`), snake_case in Python.
- All schema changes go through Alembic migrations (`alembic revision --autogenerate`); `tests/test_migrations.py` fails when the models and the migrations drift apart.
- Config comes from environment variables only (pydantic-settings, `app/core/config.py`); secrets are `SecretStr` and never logged.
- Localised content storage model: every translatable row carries one JSONB column `translations` shaped `{"en": {...}, "zh-Hant": {...}}`; both locales are required and validated by the Pydantic generic `Localized[T]`. Tag chips are a JSONB array whose items are either a plain string (a proper noun, never translated) or a `{"en": "...", "zh-Hant": "..."}` object (a translated term). Untranslated facts (company, school, certification name, href, display) are ordinary columns. Dates are `YYYY-MM` strings (`end_month` NULL = present). Slugs (`^[a-z][a-zA-Z0-9_-]{0,63}$`) are the frontend's ids and the natural key of every content table.
- Async everywhere (SQLAlchemy async sessions, asyncpg, httpx.AsyncClient); `ruff check` and `ruff format --check` must pass; tests run against a real PostgreSQL, never SQLite.

---

## 6. Commands

```bash
# Frontend (run inside frontend/)
npm install
npm run dev          # http://localhost:5173 (also the "frontend" entry in .claude/launch.json)
npm run typecheck    # tsc -b
npm run lint         # oxlint
npm test             # vitest (jsdom + Testing Library)
npm run build        # typecheck + production build to dist/

# Dev database (from the repo root; credentials in the git-ignored root .env, see .env.example)
docker compose -f docker-compose.dev.yml up -d db   # PostgreSQL 17 on 127.0.0.1:5432, plus the *_test database

# Backend (run inside backend/; uv is invoked as `python -m uv`, plain `uv` may not be on PATH)
python -m uv sync --all-groups                 # create .venv from uv.lock (runtime + dev tools)
python -m uv run alembic upgrade head          # apply migrations to DATABASE_URL (never run at startup)
python -m uv run python -m app.seed            # upsert app/seed/content.json into DATABASE_URL (idempotent)
python -m uv run uvicorn app.main:app --reload --port 8000   # http://localhost:8000/api/v1, docs at /api/v1/docs (the "backend" entry in .claude/launch.json runs it too)
python -m uv run ruff check .                  # lint
python -m uv run ruff format --check .         # formatting
python -m uv run mypy .                        # strict type check
python -m uv run pytest -q                     # tests against TEST_DATABASE_URL (schema rebuilt by the session fixture)
python -m uv run alembic revision --autogenerate -m "describe change"   # after a model change

# Full stack locally (from Phase 6)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Before every commit that touches `frontend/`: `typecheck`, `lint`, `test`, and `build` must all pass.
Before every commit that touches `backend/`: `ruff check`, `ruff format --check`, `mypy` and `pytest` must all pass (pytest needs the dev database container and `backend/.env`).

## 6.1 Frontend implementation notes

- **Routing**: every public page lives under a language prefix, `/en/...` or `/zh-hant/...` (`src/components/LanguageLayout.tsx`). `/` redirects using the saved language (`localStorage.lang`) or the browser language. The URL is the source of truth for the active language. The admin panel will live at `/admin` without a prefix.
- **i18n**: locale config in `src/i18n/languages.ts`; UI strings in `src/i18n/locales/{en,zh-Hant}.json`. Every key must exist in both files.
- **Content**: the page content of Experience, Projects, Skills and Contact is split in two. Structure lives in `src/content/` (`experience.ts`, `projects.ts`, `skills.ts`, `contact.ts`): ids, dates, order, company and school names, certification names, tech tags and URLs — typed, id-keyed, no JSX, shaped like the Phase 4 API response. Prose lives in `src/i18n/locales/{en,zh-Hant}.json` under `content.*`, keyed by the same ids (e.g. `content.experience.<id>.bullets.<key>`, `content.skills.groups.<id>`, `content.contact.labels.<id>`); `locales.test.ts` derives every key from the content modules, so a new entry fails the suite until both locales carry its text. Proper nouns (companies, schools, technologies, certifications) stay untranslated and stay in the content modules; a chip that is ordinary prose instead of a name (`Data pipelines`, `Full SDLC`) is written as `term('<id>')` (`src/content/tags.ts`) and translated under `content.terms.<id>`, so no English phrase survives on the Chinese page. Dates are stored once, as `YYYY-MM`, and the visible label is formatted per locale (`src/i18n/formatMonth.ts`), so `<time datetime>` and the label can never drift apart. Projects ships the finished card layout filled with `placeholder: true` slots until the real write-ups arrive. Contact channels (email, LinkedIn, GitHub) are plain data in `contact.ts`; the owner approved publishing them.
- **Theme**: `data-theme="light|dark"` on `<html>`, set before first paint by the inline script in `index.html`, then managed by `src/theme/useTheme.ts`. Follows the OS until the user toggles; the choice is saved in `localStorage.theme`.
- **Design tokens**: defined once in `src/index.css` (CSS variables + Tailwind v4 `@theme`). Use the semantic utilities `bg-bg`, `bg-surface`, `text-fg`, `text-muted`, `border-line`, `text-accent`, `bg-accent`, `text-accent-fg`, and the `text-display` / `text-headline` sizes. Never use raw hex values in components. All text tokens are verified >= 4.5:1 contrast in both themes; re-check when changing a colour.
- **Fonts**: self-hosted via Fontsource (Inter Variable, Noto Sans TC Variable, IBM Plex Mono), with no Google Fonts requests.
- **Animation**: GSAP + ScrollTrigger + SplitText (registered only in `src/animations/gsap.ts`; import gsap from there) and Lenis. `SmoothScrollProvider` (a pathless layout route in `App.tsx`, so it survives language switches) owns the single Lenis instance: `autoRaf: false`, driven by `gsap.ticker` with `lagSmoothing(0)`, `lenis.on('scroll', ScrollTrigger.update)`, no scrollerProxy or normalizeScroll, destroyed on unmount. Sections consume hooks in `src/animations/` (`useHeroIntro`, `useParallax`, `useSectionReveal`, `useStatementReveal`, `useScrollProgress`, `useActiveSection`, `useScrollTo`, `useHashScroll`); motion numbers live in `motion.ts`. Rules: the static DOM is the final state (no CSS ever hides content); from-states exist only inside a matched `gsap.matchMedia()` branch that requires `(prefers-reduced-motion: no-preference)`, and each branch runs through `runSafely()`, which reverts on error; animate only transform/opacity; parallax targets outer `[data-speed]` wrappers, intro and reveal tweens target inner elements, and GSAP targets never carry Tailwind translate/scale/rotate classes; exactly one pin (Statement, only on fine-pointer desktops at least `md` (48rem) wide and 600px tall where Lenis drives the wheel; on a child, never the root; `refreshPriority: 1` so it is refreshed before the triggers below it; no `anticipatePin`). `useScrollAnchor` keeps the reader's section when a breakpoint change rebuilds the matchMedia branches. Header offset: `--header-h` feeds `html { scroll-padding-top }` (Lenis and `scrollIntoView` both honour it) and `headerOffset()` in JS; never hard-code 64. Anchors: `SectionLink` renders a real `/lang#id` href; on the home page it smooth-scrolls via `useScrollTo` and focuses the section's `h2[tabindex="-1"]`; from other pages it navigates with router state that makes `useHashScroll` focus that heading; deep links land via `useHashScroll` before the first paint (no focus move); after a language switch focus returns to the language switcher, and the switch lands on the region being read (a section or the statement) at the same reading progress (`readingPosition.ts`; router state, applied on PUSH only, never replayed on Back/reload). JS media queries use the same unit as Tailwind (`MD_UP` / `BELOW_MD` in `media.ts`); never write px width queries. Reduced motion: no Lenis, no intro, parallax, pin, split or progress rule; native instant anchors. Touch tablets: no pin (the unpinned line reveal). Mobile (below `md`): no pin, halved parallax, no x-shear, native touch scroll (`syncTouch: false`); the menu is a native `<dialog>` with CSS-only motion. A scrubbed reveal never hides focus: `[data-reveal-inner]:focus-within` forces `opacity: 1` and `transform: none` (`!important` beats the inline styles GSAP writes), so a keyboard user never types into a translucent, displaced form or tabs onto a half-faded link.
- **Frontend ↔ API**: `src/env.ts` reads the two public build-time values `VITE_API_BASE_URL` (default `http://localhost:8000`, no trailing slash; production `https://api.owwsolution.com`) and `VITE_TURNSTILE_SITE_KEY` (default Cloudflare's always-pass test key `1x00000000000000000000AA`, never valid in production); both are compiled into the bundle, so a change needs a rebuild (`frontend/.env.example`). `src/api/client.ts` is the only fetch wrapper (`${base}/api/v1`, JSON in and out, 15 s deadline, errors typed as `ApiHttpError` with the contract's `code` / `fields` / `Retry-After`, `ApiPayloadError`, `ApiNetworkError`); every 2xx body is validated with zod (`zod/mini`, `src/api/schemas.ts`; object schemas stay non-strict so keys the server adds later are ignored, and `contentPayloadSchema` is typed against `ResolvedContent` so the API shape and the static shape cannot drift). Content: `useContent()` (`src/content/useContent.ts`, mounted once by `ContentProvider` in `HomePage`) returns the static snapshot synchronously (`resolveStaticContent` in `src/content/resolved.ts` turns the static modules + i18n into exactly the `GET /content` payload shape), fetches `/content?locale=<active locale>` with `credentials: 'omit'` and no custom headers, swaps the payload in on success, keeps the reader in place across the swap (the section under the header and the reading progress are read with `readAnchor()` just before it and restored with `restoreAnchor()` in a layout effect, `src/animations/readingPosition.ts`, unless Lenis is mid-scroll; so a deep link or language switch that already landed stays landed even when the API answers after the landing's font correction), then calls `scheduleScrollTriggerRefresh()` (section heights change), keeps the static snapshot on any error / non-200 / zod failure / locale mismatch, and skips a payload identical to the static one (no re-render). Sections read `useResolvedContent()` and never touch the static modules or `content.*` i18n keys directly, so both paths render identically. Layout copy the API never serves stays in the locale files: `content.techOf`, `content.experience.present`, `content.projects.{note,visit,placeholder.*}`, `content.skills.credentials.*` labels, `content.contact.labels.location`, and `content.terms.*` (needed by the static fallback). When static content changes, `backend/app/seed/content.json` changes in the same commit, and vice versa. Contact form: `src/components/ContactForm.tsx` (+ `FormField.tsx`): name / email / message, an off-screen honeypot named `website`, the Turnstile widget (`@marsidev/react-turnstile`; theme follows `<html data-theme>` through `useDocumentTheme`, language `en` / `zh-TW`), inline validation mirroring the backend limits, one always-mounted polite live region, success view that takes focus; "Send another message" returns focus to the Name field. While sending, the submit button is held with `aria-disabled`, never `disabled` (a disabled button drops keyboard focus to `<body>`); `onSubmit` ignores a second submit. It posts `{name, email, message, turnstileToken, website}` to `POST /contact` (`credentials: 'omit'`) and maps 202 → success, 422 → the named fields (a 422 that names no visible field → the generic error, widget kept), 429 → "too many attempts" (minutes from `Retry-After`), 400 `turnstile_failed` / 5xx / network → generic error + widget reset with the draft kept. Its copy lives under `contactForm.*`. Tests never reach the network and never read a developer's `.env` / `.env.local` (`test.env` in `vite.config.ts` pins both `VITE_*` values): `src/test/setup.ts` stubs `fetch` (queue responses with `src/test/api.ts`) and replaces the Turnstile module with `src/test/FakeTurnstile.tsx`.

## 6.2 Backend implementation notes

- **Layout**: `app/core` (settings, db engine/session factory, security, rate limiting, client IP, error envelope, security headers), `app/models` (SQLAlchemy 2 declarative with a naming convention and `TimestampMixin`), `app/schemas` (Pydantic v2: `CamelModel` / `StrictCamelModel`, `Localized[T]`, `Tag`, the public `ContentPayload`, the Phase 5 write models `*In`, request and error models), `app/services` (content, contact, turnstile, email, auth), `app/api/deps.py` + `app/api/v1/*` (routers), `app/seed`, `alembic/` (async env; uses `sqlalchemy.url` from the Alembic config when set, else `DATABASE_URL`, so tests point it at `TEST_DATABASE_URL`), `tests/`. `app/main.py` exposes `create_app(settings)`; the lifespan creates the engine and one shared `httpx.AsyncClient`, upserts the admin (`services.auth.ensure_admin_user`) and stores everything in `AppServices` (`core/state.py`) that the dependencies read. Migrations are never run at startup.
- **API surface**: everything under `/api/v1`, no trailing slashes (`redirect_slashes=False`), camelCase JSON, OpenAPI docs at `/api/v1/docs` and the schema at `/api/v1/openapi.json`, both switched off when `APP_ENV=production`. Every non-2xx response, on every route, is `{"error": {"code", "message", "fields"?}}` (`core/errors.py` replaces FastAPI's default handlers; codes: `validation_error` 422, `not_found` 404, `method_not_allowed` 405, `payload_too_large` 413, `turnstile_failed` 400, `invalid_credentials` 401, `unauthorized` 401, `rate_limited` 429 + `Retry-After`, `internal_error` 500, `service_unavailable` 503). `message` is developer-facing; the frontend maps `code` to its own i18n strings. Routes: `GET /health` (`SELECT 1`), `GET /content?locale=en|zh-Hant` (default `en`; every string resolved for that locale, compact UTF-8 body, strong sha256 `ETag`, `Cache-Control: public, max-age=60`, 304 on a matching `If-None-Match`), `POST /contact` (202), `POST /auth/login`, `POST /auth/logout` (204), `GET /auth/me`. Lists are ordered `sort_order ASC, slug ASC`; a slug becomes `id` in the payload. Every response also carries `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` (`core/middleware.py`); HSTS is Caddy's job. `RequestBodyLimitMiddleware` (same file) caps every request body at 64 KiB (`MAX_REQUEST_BODY_BYTES`; the largest valid request is about 20 KB): a declared `Content-Length` over it is answered 413 before routing (no rate-limit slot, no database work), and a chunked body is counted as it streams and cut off with the same 413. It sits inside CORS and the security headers, so the 413 carries both. Raise the cap, or scope it per route, when Phase 5 adds uploads.
- **Settings** (`core/config.py`; field name = env var; `backend/.env` is read automatically; keep `backend/.env.example` in sync): `APP_ENV` (`development` | `test` | `production`), `DATABASE_URL`, `TEST_DATABASE_URL` (pytest only), `JWT_SECRET` (at least 32 characters), `IP_HASH_SECRET` (at least 32 characters; the HMAC key for contact-message IP hashes; changing it makes old hashes unmatchable), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CONTACT_TO_EMAIL`, `EMAIL_FROM` (default `noreply@owwsolution.com`), `EMAIL_PROVIDER` (`console` | `resend`; `resend` requires `RESEND_API_KEY`), `TURNSTILE_SECRET_KEY`, `CORS_ORIGINS` (comma-separated exact origins, `*` rejected), `TRUSTED_PROXY` (default `false`). For a one-off run, override in the environment instead of editing `.env` (environment variables win). Settings errors never echo input values (`hide_input_in_errors=True`), so a failed start cannot print a secret. With `APP_ENV=production` the process refuses to start (`_refuse_unsafe_production`, every problem listed, no value shown) on a `change-me` placeholder in `JWT_SECRET`, `IP_HASH_SECRET` or `ADMIN_PASSWORD`, an `ADMIN_PASSWORD` under 12 characters, `JWT_SECRET == IP_HASH_SECRET`, a Cloudflare test Turnstile secret, any `EMAIL_PROVIDER` but `resend`, or an empty `CORS_ORIGINS`.
- **Auth, cookie, CORS**: one admin row, upserted at startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (Argon2id via argon2-cffi, always run in the thread pool with `run_in_threadpool` so a login never stalls the event loop; email lowercased). The startup upsert (`ensure_admin_user`) keeps exactly one admin: it deletes every other `admin_users` row (a previous `ADMIN_EMAIL` loses its password and its sessions), and when the configured password no longer verifies it re-hashes it and bumps `session_version`, revoking every session issued under the old password. `POST /auth/login` runs the IP limiter, then the email limiter, then a constant-time credential check (an unknown email verifies against a dummy hash computed at startup), and answers 401 `invalid_credentials` identically for unknown email and wrong password. Success sets `admin_session` = HS256 JWT (`sub` = user id, `email`, `ver` = the admin's `session_version`, `typ=admin_session`, `iat`, `exp` = 12 h) with `Path=/api; Max-Age=43200; HttpOnly; SameSite=Lax`, plus `Secure` when `APP_ENV=production`, no `Domain`; logout sends the same attributes with an empty value, `Max-Age=0` and `Expires` in 1970, and when the request still carries a valid session it bumps `session_version`, which revokes every copy of it (another tab or device, a leaked cookie). `GET /auth/me` and every future admin route use the `CurrentAdminDep` dependency (401 `unauthorized` for a missing, invalid, expired, orphaned or revoked token: `ver` must equal the row's `session_version`) and answer with `Cache-Control: no-store`. CORS (`CORSMiddleware`): `CORS_ORIGINS` with credentials, `expose_headers=["ETag", "Retry-After"]`, `max_age=600`; the frontend sends `credentials: 'include'` only on `/auth/*`. CSRF protection is SameSite=Lax + JSON bodies + exact origins, so Phase 5 mutating routes must keep requiring `Content-Type: application/json`. Client IP (`core/client_ip.py`): the rightmost `X-Forwarded-For` entry only when `TRUSTED_PROXY=true` (behind Caddy), otherwise the socket peer, otherwise the literal `unknown`; the raw IP stays in memory (rate-limit keys, Turnstile's `remoteip`); what is stored, emailed or logged is `hash_client_ip()`: HMAC-SHA256 keyed with `IP_HASH_SECRET` over the canonical address (IPv4-mapped IPv6 folded to IPv4), 64 hex characters, shown as its 12-character `fingerprint()` in emails and logs.
- **Rate limiting** (`core/rate_limit.py`): an in-memory sliding window per key (a deque of timestamps; rejected requests are not recorded; `Retry-After` = whole seconds until the oldest counted event leaves the window). Rules: `contact:ip:<ip>` 5 / 15 min counted on arrival before body validation (a dependency on the route), `login:ip:<ip>` 10 / 15 min (every attempt), `login:email:<email>` 5 / 15 min (failed attempts only, cleared by a successful login). Single-instance caveat: the counters live in one process, so run exactly one Uvicorn worker (Phase 4/6); several workers or replicas would each keep their own counters, and a shared store (Redis) is a later decision. Tests override `get_rate_limiter` and call `reset()`.
- **Contact flow** (`services/contact.py`): rate limit → validate `ContactRequest` (trimmed; `name` 1–100, `email` valid and ≤ 254, `message` 10–5000, `turnstileToken` 1–2048, `website` honeypot default `""`; unknown keys rejected) → honeypot filled ⇒ 202 and nothing else (logged at INFO with the source fingerprint, never the IP) → Turnstile siteverify (`services/turnstile.py`, 5 s timeout, `remoteip` omitted when unknown; `success:false` ⇒ 400 `turnstile_failed`, unreachable / non-2xx / unparsable ⇒ 503 `service_unavailable`) → insert `contact_messages` (name, email, message, `ip_hash`, `user_agent` truncated to 512 characters: the owner approved storing the hashed IP and the User-Agent; the `ck_contact_messages_ip_hash_format` check only admits a 64-hex hash, so a raw IP can never land there) with `delivery_status='pending'` (DB failure ⇒ 500) → send through the email provider → mark `sent` + `delivered_at`, or `failed` + `delivery_error` (logged at ERROR); if only that status update fails, the row stays `pending`, the error is logged and the visitor still gets the 202 (a 500 would make them send it again) → 202 `{"status":"accepted"}` either way, because the visitor must never learn whether delivery worked. Providers (`services/email.py`, `EmailProvider` protocol, chosen by `EMAIL_PROVIDER`): `console` logs the whole message at INFO (development), `resend` posts to `https://api.resend.com/emails` with `Authorization: Bearer RESEND_API_KEY` (10 s timeout, non-2xx ⇒ `EmailDeliveryError`). The message goes to `CONTACT_TO_EMAIL` from `EMAIL_FROM` with reply-to = the visitor, subject `[owwsolution.com] New message from <name>`, text = name, email, `Source: <fingerprint> (hashed IP)`, received-at (UTC ISO 8601), blank line, message. Owner decisions: messages are kept until the owner deletes them (no automatic expiry; the Phase 5 admin panel lists and deletes them), and the visitor sees success even when delivery failed, because the message is already safe in the database.
- **Seed** (`app/seed/`): `content.json` holds the same facts as `frontend/src/content/*.ts` plus the `content.*` prose of both locale files, in the storage shapes (`translations` objects, tag strings or `{"en","zh-Hant"}` term objects, `YYYY-MM` dates); rows are validated by the write models. `python -m app.seed` (from `backend/`) upserts every row by slug in one transaction (`INSERT … ON CONFLICT (slug) DO UPDATE`, `updated_at = now()`), never deletes, and is idempotent. Until the admin panel (Phase 5) becomes the source of truth, a content change is made in the static modules / locale files and in `content.json` together, so `GET /content` and the static fallback stay identical (the frontend then never even re-renders).
- **Tests** (`tests/`, 184 cases): pytest + pytest-asyncio (auto mode) + httpx `ASGITransport` against `TEST_DATABASE_URL` (a real PostgreSQL: schema dropped and `alembic upgrade head` once per session, every table truncated before each test); the real lifespan runs with Turnstile and email replaced by recording fakes through dependency overrides; no network anywhere. Only `TEST_DATABASE_URL` is read from `backend/.env`; every other setting is a test constant, so no personal value appears in test output. Coverage includes migrations at head and model drift, seed idempotency, `/content` field by field against `content.json` for both locales plus ETag / 304, every contact path, the IP hash (never a raw IP in the row, the email or the log), login / cookie / `/me` / logout, session revocation, the single-admin invariant, Argon2 off the event loop, the production settings guard, the 64 KiB body cap, rate limiting, the error envelope, CORS and the security headers.

---

## 7. Deployment

1. GCP VM with Docker + Compose; firewall open on 80/443 (plus SSH).
2. DNS A records: `owwsolution.com`, `www`, `api` → VM static external IP.
3. Caddy obtains TLS certificates automatically.
4. On merge to `main`: GitHub Actions builds images → pushes to GHCR → SSHes into the VM → `docker compose pull && docker compose up -d`.
5. Required secrets (VM host, SSH deploy key, etc.) are created **only after the owner authorises them**.
6. Production backend settings: `APP_ENV=production` refuses placeholder or development values at startup (see 6.2 Settings). Generate `JWT_SECRET` and `IP_HASH_SECRET` separately (`python -c "import secrets; print(secrets.token_urlsafe(48))"`), and set a real Turnstile secret, `EMAIL_PROVIDER=resend` with the `owwsolution.com` domain verified in Resend, `CORS_ORIGINS=https://owwsolution.com,https://www.owwsolution.com` and `TRUSTED_PROXY=true` (behind Caddy). The frontend build needs `VITE_API_BASE_URL=https://api.owwsolution.com` and the real `VITE_TURNSTILE_SITE_KEY`.
7. Run uvicorn with exactly one worker (the rate limiter is in-process) and `--no-access-log`: its access log would record raw client IPs, which the backend otherwise never writes. Put Caddy's `request_body max_size` in front of the app's 64 KiB cap.

---

## 8. Installed Claude Code plugins (project scope)

- `superpowers`: planning / TDD / debugging workflows
- `ui-ux-pro-max`: UI/UX design system guidance
- `code-review`: pre-commit review
- `example-skills` (Anthropic): includes `webapp-testing` and `mcp-builder`

---

## 9. Roadmap

| Phase | Scope |
|-------|-------|
| 0 | Repo init, CLAUDE.md, README, `.gitignore`, GitHub remote, GitHub MCP |
| 1 | Frontend scaffold (Vite + React + TS + Tailwind + i18n + theme), design tokens |
| 2 | Home page: parallax hero, scroll-driven section transitions |
| 3 | Experience, Projects, Skills, Contact, CV download (static data first) |
| 4 | FastAPI + PostgreSQL: content API, contact endpoint, admin auth |
| 5 | Admin panel (CRUD for bilingual content) |
| 6 | Dockerize all tiers + Caddy, full-stack local run |
| 7 | GCP VM + DNS + HTTPS, GitHub Actions auto-deploy |
| 8 | SEO, analytics, performance and accessibility pass |

---

## 10. Open Questions (TBD)

- None at the moment. (The localised content storage model was decided in Phase 4: one JSONB `translations` column per row, see section 5.)
