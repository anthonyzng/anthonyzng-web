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
| Admin auth | Single admin account, Argon2 password hash, JWT in httpOnly cookie, login rate limiting (TOTP 2FA later). Admin UI at `owwsolution.com/admin` |
| Contact    | Cloudflare Turnstile (bot protection) + Resend (email from `noreply@owwsolution.com`). Every message is also stored in the DB. Recipient comes from env var `CONTACT_TO_EMAIL` (value kept in `CLAUDE.local.md`, never committed) |
| Analytics  | Self-hosted Umami in its own container (own database in the same PostgreSQL instance) |

---

## 3. Repository Layout

```
anthonyzng-web/
├── CLAUDE.md
├── README.md
├── docker-compose.yml          # production stack
├── docker-compose.dev.yml      # local dev overrides (hot reload)
├── .env.example                # every required env var, placeholder values only
├── .mcp.json                   # GitHub MCP server (token read from env var GITHUB_PAT)
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
- Type hints everywhere; Pydantic schemas for all request/response bodies.
- All schema changes go through Alembic migrations.
- Config comes from environment variables only (pydantic-settings).
- Localised content fields are stored per locale (e.g. `title_en`, `title_zh_hant`, or a translations table; `TBD` at implementation time).

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

# Full stack locally (from Phase 6)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Backend only (from Phase 4)
cd backend && uvicorn app.main:app --reload
```

Before every commit that touches `frontend/`: `typecheck`, `lint`, `test`, and `build` must all pass.

## 6.1 Frontend implementation notes

- **Routing**: every public page lives under a language prefix, `/en/...` or `/zh-hant/...` (`src/components/LanguageLayout.tsx`). `/` redirects using the saved language (`localStorage.lang`) or the browser language. The URL is the source of truth for the active language. The admin panel will live at `/admin` without a prefix.
- **i18n**: locale config in `src/i18n/languages.ts`; UI strings in `src/i18n/locales/{en,zh-Hant}.json`. Every key must exist in both files.
- **Theme**: `data-theme="light|dark"` on `<html>`, set before first paint by the inline script in `index.html`, then managed by `src/theme/useTheme.ts`. Follows the OS until the user toggles; the choice is saved in `localStorage.theme`.
- **Design tokens**: defined once in `src/index.css` (CSS variables + Tailwind v4 `@theme`). Use the semantic utilities `bg-bg`, `bg-surface`, `text-fg`, `text-muted`, `border-line`, `text-accent`, `bg-accent`, `text-accent-fg`, and the `text-display` / `text-headline` sizes. Never use raw hex values in components. All text tokens are verified >= 4.5:1 contrast in both themes; re-check when changing a colour.
- **Fonts**: self-hosted via Fontsource (Inter Variable, Noto Sans TC Variable, IBM Plex Mono), with no Google Fonts requests.
- **Animation**: GSAP + ScrollTrigger + SplitText (registered only in `src/animations/gsap.ts`; import gsap from there) and Lenis. `SmoothScrollProvider` (a pathless layout route in `App.tsx`, so it survives language switches) owns the single Lenis instance: `autoRaf: false`, driven by `gsap.ticker` with `lagSmoothing(0)`, `lenis.on('scroll', ScrollTrigger.update)`, no scrollerProxy or normalizeScroll, destroyed on unmount. Sections consume hooks in `src/animations/` (`useHeroIntro`, `useParallax`, `useSectionReveal`, `useStatementReveal`, `useScrollProgress`, `useActiveSection`, `useScrollTo`, `useHashScroll`); motion numbers live in `motion.ts`. Rules: the static DOM is the final state (no CSS ever hides content); from-states exist only inside a matched `gsap.matchMedia()` branch that requires `(prefers-reduced-motion: no-preference)`, and each branch runs through `runSafely()`, which reverts on error; animate only transform/opacity; parallax targets outer `[data-speed]` wrappers, intro and reveal tweens target inner elements, and GSAP targets never carry Tailwind translate/scale/rotate classes; exactly one pin (Statement, only on fine-pointer desktops at least `md` (48rem) wide and 600px tall where Lenis drives the wheel; on a child, never the root; `refreshPriority: 1` so it is refreshed before the triggers below it; no `anticipatePin`). `useScrollAnchor` keeps the reader's section when a breakpoint change rebuilds the matchMedia branches. Header offset: `--header-h` feeds `html { scroll-padding-top }` (Lenis and `scrollIntoView` both honour it) and `headerOffset()` in JS; never hard-code 64. Anchors: `SectionLink` renders a real `/lang#id` href; on the home page it smooth-scrolls via `useScrollTo` and focuses the section's `h2[tabindex="-1"]`; from other pages it navigates with router state that makes `useHashScroll` focus that heading; deep links land via `useHashScroll` before the first paint (no focus move); after a language switch focus returns to the language switcher, and the switch lands on the region being read (a section or the statement) at the same reading progress (`readingPosition.ts`; router state, applied on PUSH only, never replayed on Back/reload). JS media queries use the same unit as Tailwind (`MD_UP` / `BELOW_MD` in `media.ts`); never write px width queries. Reduced motion: no Lenis, no intro, parallax, pin, split or progress rule; native instant anchors. Touch tablets: no pin (the unpinned line reveal). Mobile (below `md`): no pin, halved parallax, no x-shear, native touch scroll (`syncTouch: false`); the menu is a native `<dialog>` with CSS-only motion.

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

- Localised content storage model (decide in Phase 4)
