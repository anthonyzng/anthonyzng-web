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
Minimal, modern, professional editorial portfolio: generous whitespace, strong grotesk + mono typography, neutral palette with one accent, tasteful scroll motion. Detail: `frontend/CLAUDE.md`.

---

## 2. Architecture

- Three tiers, each in its own Docker container: React SPA (static, nginx), FastAPI backend, one-off `migrate` job.
- They run on the **Owwsolution platform** (private repo `Owwsolution/platform`): its Caddy and PostgreSQL 17 are shared; this repo brings its own database `anthonyzng_web` and Caddy snippet `deploy/anthonyzng-web.caddy`.
- Domains: `owwsolution.com` (+ `www`) → frontend, `api.owwsolution.com` → backend.
- Hosting: GCP Compute Engine VM `anthonyzng-web`, Docker only on the host; CI/CD by GitHub Actions to GHCR and the VM.
- DNS and edge: Cloudflare (proxied, Full strict, Web Analytics). Details: the `infra` rule (`.claude/rules/infra.md`).

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
├── db/
├── frontend/
├── backend/
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
- Skills: `ship` walks the steps from the checks to the push; also `verify-ui`, `add-ui-string`, `schema-change`, `local-stack`.
- Hooks enforce these rules, they do not replace them (detail: `.claude/rules/claude-config.md`). When a hook blocks, fix the cause; never bypass it.
  - `git_guard.py`: no commit on `main`, no push from or to `main`, no secrets or key files, no commit whose changed areas fail the section 6 checks, no GitHub MCP file write to `main`.
  - `checks.py`: runs the section 6 checks per changed area and remembers a pass.
  - `format_python.py`: `ruff format` on every edited `backend/**/*.py`.
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

---

## 6. Commands

```bash
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

- Plugins: `superpowers`, `ui-ux-pro-max`, `code-review`, `example-skills`.
- The figma skills are user-invocable only; ask the owner to run one (detail: `.claude/rules/claude-config.md`).

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
