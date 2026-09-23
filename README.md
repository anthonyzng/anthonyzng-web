# anthonyzng-web

Personal professional showcase website of Anthony Ng — Full Stack Software Developer, AI Developer, and Assistant Manager in Software Development.

Live at **[owwsolution.com](https://owwsolution.com)** (coming soon).

## Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, GSAP ScrollTrigger, Lenis, react-i18next (EN / 繁中)
- **Backend:** Python, FastAPI, SQLAlchemy, Alembic
- **Database:** PostgreSQL
- **Infra:** Docker Compose (one container per tier), Caddy, GCP Compute Engine, GitHub Actions

## Configuration

The frontend reads its build-time settings from environment variables (see `frontend/.env.example`;
copy it to `frontend/.env` locally). They are baked into the bundle when `npm run build` runs, so a
deployment must provide them to the build step (Docker build arg / GitHub Actions secret), not to the
running container.

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_CONTACT_EMAIL` | yes, for a real deploy | Address shown in the Contact section and used for its `mailto:` link. Never committed. Unset, the email row is omitted and a production build prints a warning. |

## Status

Early setup. See [CLAUDE.md](CLAUDE.md) for architecture, workflow, and roadmap.
