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
| Backend    | Python + FastAPI, SQLAlchemy 2.x, Alembic migrations, Pydantic v2 |
| Database   | PostgreSQL |
| Proxy/TLS  | Caddy (automatic Let's Encrypt certificates) |
| CI/CD      | GitHub Actions: lint/test → build images → push to GHCR → deploy to GCP VM over SSH |
| Admin auth | `TBD` (proposed: single admin account, JWT in httpOnly cookie) |
| Contact    | Bot protection `TBD` (proposed: Cloudflare Turnstile); email delivery `TBD` |
| Analytics  | Self-hosted Umami in its own container (proposed, pending confirmation) |

---

## 3. Repository Layout

```
anthonyzng-web/
├── CLAUDE.md
├── README.md
├── docker-compose.yml          # production stack
├── docker-compose.dev.yml      # local dev overrides (hot reload)
├── .env.example                # every required env var, placeholder values only
├── .claude/
│   ├── settings.json           # project plugins
│   └── commands/do_pr.md       # /do_pr command
├── frontend/
│   ├── Dockerfile              # multi-stage: build → static serve
│   └── src/
│       ├── components/
│       ├── sections/           # Hero, Experience, Projects, Skills, Contact
│       ├── animations/         # scroll / parallax hooks
│       ├── i18n/               # UI string translations
│       ├── admin/              # admin panel pages
│       └── pages/
├── backend/
│   ├── Dockerfile
│   ├── alembic/
│   └── app/
│       ├── api/                # routers
│       ├── models/             # SQLAlchemy models
│       ├── schemas/            # Pydantic schemas
│       ├── services/
│       └── core/               # config, security, db session
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

### 4.4 Security
- **Before creating, using, or storing any key, token, password, or credential, ask the owner for authorisation.** This covers GitHub tokens, GCP service accounts, SSH deploy keys, GitHub Actions secrets, DNS changes, firewall rules, and API keys.
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
- Type hints everywhere; Pydantic schemas for all request/response bodies.
- All schema changes go through Alembic migrations.
- Config comes from environment variables only (pydantic-settings).
- Localised content fields are stored per locale (e.g. `title_en`, `title_zh_hant`, or a translations table; `TBD` at implementation time).

---

## 6. Commands (fill in once scaffolded)

```bash
# Full stack locally
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Frontend only
cd frontend && npm install && npm run dev

# Backend only
cd backend && uvicorn app.main:app --reload
```

---

## 7. Deployment

1. GCP VM with Docker + Compose; firewall open on 80/443 (plus SSH).
2. DNS A records: `owwsolution.com`, `www`, `api` → VM static external IP.
3. Caddy obtains TLS certificates automatically.
4. On merge to `main`: GitHub Actions builds images → pushes to GHCR → SSHes into the VM → `docker compose pull && docker compose up -d`.
5. Required secrets (VM host, SSH deploy key, etc.) are created **only after the owner authorises them**.

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

- Admin authentication method
- Contact form: bot protection provider and email delivery provider; destination inbox
- Analytics provider (proposed: self-hosted Umami container)
- Localised content storage model (decide in Phase 4)
