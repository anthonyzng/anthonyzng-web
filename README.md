# anthonyzng-web

Personal professional showcase website of Anthony Ng — Full Stack Software Developer, AI Developer, and Assistant Manager in Software Development.

Live at **[owwsolution.com](https://owwsolution.com)**.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, GSAP ScrollTrigger, Lenis, react-i18next (EN / 繁中), zod, Cloudflare Turnstile
- **Backend:** Python 3.13, FastAPI, SQLAlchemy 2 (async, asyncpg), Alembic, Pydantic v2, uv
- **Database:** PostgreSQL 17 (bilingual content stored as JSONB translations)
- **Infra:** Docker Compose (one container per tier), Caddy, GCP Compute Engine, GitHub Actions

## Features

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

## Status

Phases 0–8 done: the scroll-driven bilingual home page paints a saved copy of its content at once (`npm run content:sync`) and switches to the content API when it answers; the backend serves `GET /api/v1/content`, the contact endpoint (Turnstile check, message stored, email via a pluggable provider), the admin login (Argon2, JWT in an httpOnly cookie, rate limited) and the admin API behind the admin panel at `/admin`: bilingual content editing and ordering, project cover images and the downloadable CV (stored in PostgreSQL), and the contact inbox. Every tier runs in its own container (Phase 6): a one-off migration job, the FastAPI backend and the frontend on nginx, on the Owwsolution platform's Caddy and PostgreSQL (shared with the other Owwsolution apps); with a local platform running (see the `local-stack` skill, `.claude/skills/local-stack/SKILL.md`), the whole site runs locally with one command:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

(site at http://localhost:8080, API at http://localhost:8080/api/v1 and http://api.localhost:8080/api/v1; needs `.env` and `backend/.env`, see the `.env.example` files). Live at https://owwsolution.com: deployed to a GCP VM by GitHub Actions on every merge to `main` (Phase 7), behind Cloudflare, hardened after a security review, with SEO metadata and Cloudflare Web Analytics (Phase 8).

## Roadmap

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

The localised content storage model was decided in Phase 4: one JSONB `translations` column per row (see `backend/CLAUDE.md`).

See [CLAUDE.md](CLAUDE.md) for the workflow and where each topic is documented.
