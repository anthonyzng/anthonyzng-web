# CLAUDE.md

Guidance for Claude Code (and any sub-agent) working in this repository.

> Items marked `TBD` are open decisions. Do not guess them; ask the owner.

## 1. Project Overview

**anthonyzng-web** is the personal professional showcase website of Anthony Ng, served at **owwsolution.com**.
GitHub repo: **`anthonyzng/anthonyzng-web`** (public).

The site must communicate the owner's three roles: Full Stack Software Developer; AI Developer; Assistant Manager, Software Development.

Features: experience timeline, projects, skills, tools, archive, contact form (Turnstile), CV, EN + zh-Hant, dark/light worlds, SEO, analytics, admin panel (content in the DB). Detail: `README.md`.

### Home page requirements (non-negotiable)
- **Scroll-driven animations**: elements animate in sync with scroll progress, not just a one-time fade-in.
- **Parallax scrolling**: layered elements moving at different speeds.
- Smooth (target 60fps), honours `prefers-reduced-motion`, degrades gracefully on mobile and older browsers.

### Design direction
Minimal, modern, professional editorial portfolio: generous whitespace, grotesk + mono type, neutral palette + one accent, tasteful scroll motion. Detail: `frontend/CLAUDE.md`.

## 2. Architecture

- Three tiers, one Docker container each: React SPA (nginx), FastAPI backend, one-off `migrate` job.
- On the **Owwsolution platform** (private repo `Owwsolution/platform`): shared Caddy and PostgreSQL 17; this repo brings its database `anthonyzng_web` and Caddy snippet `deploy/anthonyzng-web.caddy`.
- Domains: `owwsolution.com` (+ `www`) → frontend, `api.owwsolution.com` → backend; DNS and edge: Cloudflare (proxied, Full strict, Web Analytics).
- Hosting: GCP VM `anthonyzng-web`, Docker only; CI/CD: GitHub Actions to GHCR and the VM. Details: `.claude/rules/infra.md`.

## 3. Repository Layout

```
anthonyzng-web/
├── CLAUDE.md                   # what every task needs; section 7 indexes the topic notes below
├── README.md
├── docker-compose*.yml, .env.example   # platform, local and dev-database stacks (infra rule)
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

Per-folder detail: the nested CLAUDE.md files and the rules; CodeGraph answers "where is X".

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
  - `git_guard.py`: no commit on `main`; no push from or to `main` (except a new repository's initial push); no commit adding a secret or key file, or failing the section 6 checks; no GitHub MCP file write to `main` or without a branch, of a key file or with a secret.
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

## 5. Coding Conventions

### General
- Code, comments, commit messages, and docs are written in **English**.
- User-facing content is available in both `en` and `zh-Hant`. Never hard-code UI strings; use i18n keys.

## 6. Commands

Per-area commands: `frontend/CLAUDE.md`, `backend/CLAUDE.md`; local stack: the `local-stack` skill; production: `.claude/rules/infra.md`.

`python .claude/hooks/checks.py` runs the per-area checks for each changed area (or `checks.py frontend|backend` for one); the commit hook runs it too.
Before every commit that touches `frontend/`: `typecheck`, `lint`, `test`, and `build` must all pass.
Before every commit that touches `backend/`: `ruff check`, `ruff format --check`, `mypy` and `pytest` must all pass (pytest needs the dev database container and `backend/.env`).
## 7. Where the details live

This file holds what every task needs. Topic notes are split out so they load only when relevant:

| File | Loaded | Covers |
|------|--------|--------|
| `frontend/CLAUDE.md` | automatically, when working under `frontend/` | routing, i18n, theme, design tokens, fonts, animation rules; stack, design direction, conventions, files, commands |
| `backend/CLAUDE.md` | automatically, when working under `backend/` | layout, API surface and error envelope, settings, seed; stack, conventions, files, commands |
| `.claude/rules/infra.md` | with `deploy/`, compose files, workflows, Dockerfiles, `db/`, infra docs | architecture, platform, hosting, CI/CD, DNS, backups |
| `.claude/rules/claude-config.md` | automatically, with `.claude/**` and any `CLAUDE.md` | hooks, skills, plugins |
| `.claude/skills/local-stack/SKILL.md` | on demand | the full-stack commands on a local platform |
| `README.md` | on demand | features, roadmap |
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

A rule loads only when a matching file is read or edited; for a question that touches no file, read the rule this table names.

When a change alters a documented behaviour, update the file that documents it in the same commit.

## 8. Installed Claude Code plugins (project scope)

`superpowers`, `ui-ux-pro-max`, `code-review`, `example-skills`. The figma skills are user-invocable only; ask the owner to run one (detail: `.claude/rules/claude-config.md`).

## Compact instructions
When compacting, keep: the current task and its acceptance checks; the path of the plan, ledger or harness focus file in use;
every file modified in this session; the test and check commands run and their last result; open questions for the
owner; decisions the owner made in this session, quoted. Drop: file contents already written to disk, tool output
already acted on, superseded attempts.
