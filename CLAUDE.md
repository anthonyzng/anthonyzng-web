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
- Downloadable CV (PDF): in the hero, the section dock and the contact screen
- Tools the owner built (cards linking to each tool) and an archive of earlier portfolio versions, blog posts and other links
- **Bilingual: English + Traditional Chinese** (language switcher, content stored per locale)
- **Dark / light mode** (follows system by default, user toggle persisted): two worlds, a black hole and a night sky in dark mode, an ink-wash bamboo grove on paper in light mode
- SEO (meta tags, Open Graph, sitemap, `hreflang`, structured data)
- Analytics
- **Admin panel** to manage experience, projects, skills, tools, the archive, the home page's hero and "In brief" texts, and the CV (content lives in the database)

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

- Three tiers, each in its own Docker container: React SPA (static, nginx), FastAPI backend, one-off `migrate` job.
- They run on the **Owwsolution platform** (private repo `Owwsolution/platform`): its Caddy and PostgreSQL 17 are shared; this repo brings its own database `anthonyzng_web` and Caddy snippet `deploy/anthonyzng-web.caddy`.
- Domains: `owwsolution.com` (+ `www`) → frontend, `api.owwsolution.com` → backend.
- Hosting: GCP Compute Engine VM `anthonyzng-web`, Docker only on the host; CI/CD by GitHub Actions to GHCR and the VM.
- DNS and edge: Cloudflare (proxied, Full strict, Web Analytics). Details: the `infra` rule (`.claude/rules/infra.md`).

### Tech stack

| Layer      | Choice |
|------------|--------|
| Frontend   | React + TypeScript + Vite |
| Styling    | Tailwind CSS |
| Animation  | GSAP + ScrollTrigger (scroll-driven, pinning, parallax), Lenis (smooth scroll) |
| i18n       | react-i18next; locales `en`, `zh-Hant` |
| Routing    | React Router |
| Backend    | Python 3.13 + FastAPI, SQLAlchemy 2.x (async, asyncpg), Alembic migrations, Pydantic v2; dependencies managed with uv (`pyproject.toml` + committed `uv.lock`) |
| Database   | PostgreSQL 17, the platform's shared instance: database `anthonyzng_web`, roles `anthonyzng_web_owner` (migrations) and `anthonyzng_web_app` (the backend); bilingual content stored as one JSONB `translations` column per row (see section 5) |
| Admin auth | Single admin account, Argon2 password hash, JWT in httpOnly cookie, login rate limiting, optional TOTP second factor (authenticator app; `docs/backend/auth.md`). Admin UI at `owwsolution.com/admin` |
| Contact    | Cloudflare Turnstile (bot protection) + Resend (email from `noreply@owwsolution.com`). Every message is also stored in the DB. Recipient comes from env var `CONTACT_TO_EMAIL` (value kept in `CLAUDE.local.md`, never committed) |

---

## 3. Repository Layout

```
anthonyzng-web/
├── CLAUDE.md                   # what every task needs; section 7 indexes the topic notes below
├── README.md
├── docker-compose.yml          # the site on the platform: migrate (one-off), backend, frontend (no proxy, no db, no `build`)
├── docker-compose.local.yml    # override: the site on a local platform stack over HTTP (localhost:8080); holds the `build` sections
├── docker-compose.dev.yml      # the `db` service alone (PostgreSQL 17 on 127.0.0.1:5432) for host-run dev (project anthonyzng-web-dev)
├── .env.example                # root Compose variables (the platform's database URLs, the dev database), placeholders only
├── .mcp.json                   # GitHub MCP server (token read from env var GITHUB_PAT)
├── .claude/
│   ├── settings.json           # project plugins and hooks (hooks/git_guard.py before git commit/push and GitHub MCP file writes, hooks/format_python.py after edits)
│   ├── hooks/                  # git_guard.py (no commit/push on main, secret scan, checks), checks.py (section 6 checks), format_python.py
│   ├── skills/                 # ship, verify-ui, add-ui-string, schema-change, local-stack
│   └── commands/do_pr.md       # /do_pr command
├── db/
├── frontend/
│   ├── CLAUDE.md               # frontend rules, loaded when working under frontend/
│   ├── Dockerfile              # multi-stage: npm build → unprivileged nginx on :8080
│   ├── nginx.conf              # SPA fallback, asset caching, /healthz
│   ├── .env.example            # VITE_API_BASE_URL, VITE_TURNSTILE_SITE_KEY (public build-time values)
│   ├── scripts/                # sync-content.mjs (`npm run content:sync`)
│   └── src/
│       ├── api/                # fetch client, zod schemas, /content and /contact calls, file URLs
│       ├── components/         # incl. ContactForm + ContactDialog, ProjectCard, TagList + EdgeCat, SectionDock, PageBackdrop
│       ├── content/            # resolved shape, snapshot/<locale>.json (saved API payload), useContent + ContentProvider
│       ├── sections/           # Hero, Statement, Experience, Projects, Skills, Tools, Closing (the contact screen), Archive
│       ├── assets/             # images bundled by Vite (the statement photo)
│       ├── animations/         # scroll / parallax hooks, the canvas scenes (black hole, ink stream, sky, bamboo, contact)
│       ├── i18n/               # UI string translations, formatMonth, formatFileSize
│       ├── admin/              # admin panel (Phase 5)
│       └── pages/
├── backend/
│   ├── CLAUDE.md               # backend rules, loaded when working under backend/
│   ├── Dockerfile              # multi-stage: uv sync → slim runtime, non-root, uvicorn on :8000
│   ├── pyproject.toml          # uv-managed project; uv.lock is committed
│   ├── .env.example            # every backend env var, placeholder values only
│   ├── alembic.ini
│   ├── alembic/                # async env.py + versions/
│   ├── tests/                  # pytest against a real PostgreSQL (TEST_DATABASE_URL)
│   └── app/
│       ├── main.py             # create_app() + lifespan; `app` for uvicorn (built on first access)
│       ├── db_roles.py         # `python -m app.db_roles`: checks the backend's least-privilege database role (run by `migrate`)
│       ├── admin_totp.py       # `python -m app.admin_totp status|reset`: the admin's two-factor sign-in from a shell
│       ├── api/                # deps.py + v1/ routers (health, content, contact, auth, files, admin)
│       ├── models/             # SQLAlchemy models (content, contact_message, admin_user, stored_file)
│       ├── schemas/            # Pydantic schemas (public payload, write models, admin, requests, errors)
│       ├── services/           # content, content_admin, collections, files, messages, contact, turnstile, email, auth
│       ├── seed/               # content.json + `python -m app.seed` (bootstraps an empty database)
│       └── core/               # config, db, security, rate_limit, client_ip, errors, middleware
├── docs/                       # topic notes read on demand (section 7)
│   ├── frontend/               # content, scenes, api-client, admin-panel, seo
│   ├── backend/                # auth, contact, admin-api, files, tests
│   ├── containers.md           # the platform, compose stack, images, Caddy snippet
│   └── deployment.md           # VM, CI/CD, DNS, Cloudflare, backups, operations
├── deploy/
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
   → run the section 6 checks (python .claude/hooks/checks.py)
   → code review the diff (code-review skill); fix every finding and re-review until clean
   → commit
   → push to the current branch
```

- Branch name uses local time at creation, e.g. `21092026_143005_by_claude_anthony`.
  PowerShell: `git checkout -b "$(Get-Date -Format 'ddMMyyyy_HHmmss')_by_claude_anthony"`
- **Never commit directly to `main`** (the one exception is the initial repository commit).
- The same branch keeps receiving commits and pushes across tasks until the owner runs **`/do_pr`**.
- The `ship` skill (`.claude/skills/ship/SKILL.md`) walks these steps from the checks to the push. Other project skills: `verify-ui` (the browser matrix: widths, themes, languages), `add-ui-string` (both locales), `schema-change` (model to docs, end to end), `local-stack` (the containerised stack on a local platform).
- Hooks (`.claude/settings.json`) enforce the rules, they do not replace them: `git_guard.py` refuses a `git commit` on `main`, a push from or to `main` (except a new repository's initial push, while its remote has no `main` yet), a commit that adds a key-shaped string or a file such as `.env` / `*.pem` (a deliberate example line can carry `secret-scan: allow`), a commit whose changed areas fail the section 6 checks (this repository only; for any repository the guard acts on the one the command targets: `git -C <dir>`, a leading `cd <dir> &&` or the session's folder), and a GitHub MCP write (`push_files`, `create_or_update_file`, `delete_file`) to `main`, without a branch, of such a file or with a secret in it (pull requests and their merge are not affected) (run by `checks.py`, which remembers a pass per area in `.git/claude-checks/`, so checks already run for the same changes are not repeated); `format_python.py` runs the backend's `ruff format` on every edited `backend/**/*.py`. When the harness (`Owwsolution/harness`) is installed, `git_guard.py` reports its blocks and `checks.py` runs its checks through `harness check`, via `.claude/hooks/harness_emit.py`; without it nothing changes. When a hook blocks, fix the cause; never bypass it.
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
- Localised content storage model: every translatable row carries one JSONB column `translations` shaped `{"en": {...}, "zh-Hant": {...}}`; both locales are required and validated by the Pydantic generic `Localized[T]`. Tag chips are a JSONB array whose items are either a plain string (a proper noun, never translated) or a `{"en": "...", "zh-Hant": "..."}` object (a translated term). Untranslated facts (company, company_url, school, certification name, the `url` of a school, certification, tool or archive entry, tool name, archive month, href, display) are ordinary columns. Dates are `YYYY-MM` strings (`end_month` NULL = present). Slugs (`^[a-z][a-zA-Z0-9_-]{0,63}$`) are the frontend's ids and the natural key of every content table.
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
npm run preview      # serve dist/ on http://localhost:4173 (the "frontend-preview" entry in .claude/launch.json; for Lighthouse runs against a production build)
npm run content:sync # save GET /content (both locales) as src/content/snapshot/*.json; default http://localhost:8000, or `-- <api origin>`

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

# Full stack on a local platform (Git Bash, from the repo root). Once: the platform repo checked out next to
# this one (../platform) as a local platform (its CLAUDE.md section 6 "Locally": its .env with the two COMPOSE_*
# lines), with this repo's deploy/local-caddy.env copied to its caddy.env; then this site's networks, database
# and addresses (the database URLs go into this repo's root .env; the stack also needs backend/.env, the compose
# `env_file`, see backend/.env.example):
P=$(cd ../platform && pwd); export PLATFORM_DIR=$P
(cd "$P" && scripts/app-networks sync && docker compose up -d --wait)
"$P/scripts/provision-app" anthonyzng-web --scheme postgresql+asyncpg --write-env "$PWD/.env"   # db-anthonyzng-web + the database
"$P/scripts/app-networks" add anthonyzng-web edge                                                 # edge-anthonyzng-web
"$P/scripts/app-hosts" set anthonyzng-web localhost,www.localhost,api.localhost,:8080            # what the snippet may serve
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build   # http://localhost:8080, API also http://api.localhost:8080
"$P/scripts/install-site" anthonyzng-web deploy/anthonyzng-web.caddy             # after the first up, and after each snippet change
(cd "$P" && docker compose up -d caddy)                                            # after any edit of the platform's caddy.env (install-site refuses until then)
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f backend  # follow one service
docker compose -f docker-compose.yml -f docker-compose.local.yml run --rm -T backend python -m app.seed </dev/null   # seed inside the stack
docker compose -f docker-compose.yml -f docker-compose.local.yml down            # stop (the data stays in the platform's database)
```

`python .claude/hooks/checks.py` runs these for each changed area (or `checks.py frontend|backend` for one); the commit hook runs it too.
Before every commit that touches `frontend/`: `typecheck`, `lint`, `test`, and `build` must all pass.
Before every commit that touches `backend/`: `ruff check`, `ruff format --check`, `mypy` and `pytest` must all pass (pytest needs the dev database container and `backend/.env`).
---

## 7. Where the details live

This file holds what every task needs. Topic notes are split out so they load only when relevant:

| File | Loaded | Covers |
|------|--------|--------|
| `frontend/CLAUDE.md` | automatically, when working under `frontend/` | routing, i18n, theme, design tokens, fonts, animation rules |
| `backend/CLAUDE.md` | automatically, when working under `backend/` | layout, API surface and error envelope, settings, seed |
| `docs/frontend/content.md` | on demand | page content sources, snapshot, per-section content rules |
| `docs/frontend/scenes.md` | on demand | the themed scenes, contact screen, page glass, tags, cats, card light, dock |
| `docs/frontend/api-client.md` | on demand | env values, fetch client, zod schemas, `useContent`, contact form, test stubs |
| `docs/frontend/admin-panel.md` | on demand | the admin panel |
| `docs/frontend/seo.md` | on demand | SEO, Lighthouse |
| `docs/backend/auth.md` | on demand | admin auth, cookie, CORS, CSRF, client IP, rate limiting, TOTP |
| `docs/backend/contact.md` | on demand | contact flow, email |
| `docs/backend/admin-api.md` | on demand | admin API |
| `docs/backend/files.md` | on demand | uploads, image pipeline, CV, file serving |
| `docs/backend/tests.md` | on demand | test coverage |
| `docs/containers.md` | on demand | the platform, compose stack, database roles, images, Caddy snippet, local stack |
| `docs/deployment.md` | on demand | GCP VM, production config, CI/CD, DNS, Cloudflare, backups, operations |

When a change alters a documented behaviour, update the file that documents it in the same commit.

---

## 8. Installed Claude Code plugins (project scope)

- `superpowers`: planning / TDD / debugging workflows
- `ui-ux-pro-max`: UI/UX design system guidance
- `code-review`: pre-commit review
- `example-skills` (Anthropic): includes `webapp-testing` and `mcp-builder`

The figma skills (synced from claude.ai) are `user-invocable-only` here (`skillOverrides` in `.claude/settings.json`): they are not offered to the model; when a task needs one, ask the owner, who runs it as a slash command.

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
