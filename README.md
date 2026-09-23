# anthonyzng-web

Personal professional showcase website of Anthony Ng — Full Stack Software Developer, AI Developer, and Assistant Manager in Software Development.

Live at **[owwsolution.com](https://owwsolution.com)** (coming soon).

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, GSAP ScrollTrigger, Lenis, react-i18next (EN / 繁中), zod, Cloudflare Turnstile
- **Backend:** Python 3.13, FastAPI, SQLAlchemy 2 (async, asyncpg), Alembic, Pydantic v2, uv
- **Database:** PostgreSQL 17 (bilingual content stored as JSONB translations)
- **Infra:** Docker Compose (one container per tier), Caddy, GCP Compute Engine, GitHub Actions

## Status

Phases 0–4 done: the scroll-driven bilingual home page renders its static content at once and switches to the content API when it answers; the backend serves `GET /api/v1/content`, the contact endpoint (Turnstile check, message stored, email via a pluggable provider) and the admin login (Argon2, JWT in an httpOnly cookie, rate limited). Next: admin panel (Phase 5), Docker + Caddy (Phase 6), GCP deployment (Phase 7).

See [CLAUDE.md](CLAUDE.md) for architecture, workflow, commands and roadmap.
