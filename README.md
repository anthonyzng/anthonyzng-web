# anthonyzng-web

Personal professional showcase website of Anthony Ng — Full Stack Software Developer, AI Developer, and Assistant Manager in Software Development.

Live at **[owwsolution.com](https://owwsolution.com)**.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, GSAP ScrollTrigger, Lenis, react-i18next (EN / 繁中), zod, Cloudflare Turnstile
- **Backend:** Python 3.13, FastAPI, SQLAlchemy 2 (async, asyncpg), Alembic, Pydantic v2, uv
- **Database:** PostgreSQL 17 (bilingual content stored as JSONB translations)
- **Infra:** Docker Compose (one container per tier), Caddy, GCP Compute Engine, GitHub Actions

## Status

Phases 0–8 done: the scroll-driven bilingual home page paints a saved copy of its content at once (`npm run content:sync`) and switches to the content API when it answers; the backend serves `GET /api/v1/content`, the contact endpoint (Turnstile check, message stored, email via a pluggable provider), the admin login (Argon2, JWT in an httpOnly cookie, rate limited) and the admin API behind the admin panel at `/admin`: bilingual content editing and ordering, project cover images and the downloadable CV (stored in PostgreSQL), and the contact inbox. Every tier runs in its own container (Phase 6): PostgreSQL, a one-off migration job, the FastAPI backend, the frontend on nginx and Caddy in front, so the whole site runs locally with one command:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

(site at http://localhost:8080, API at http://api.localhost:8080/api/v1; needs `.env` and `backend/.env`, see the `.env.example` files). Live at https://owwsolution.com: deployed to a GCP VM by GitHub Actions on every merge to `main` (Phase 7), behind Cloudflare, hardened after a security review, with SEO metadata and Cloudflare Web Analytics (Phase 8).

See [CLAUDE.md](CLAUDE.md) for architecture, workflow, commands and roadmap.
