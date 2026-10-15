---
name: local-stack
description: Start, rebuild, inspect or stop the full containerised stack on a local Owwsolution platform (http://localhost:8080). Use to test the Docker images, the Caddy snippet, the CSP or anything that only shows behind the proxy.
---

# Local full stack

Run from the repo root in Git Bash (the Bash tool). The full command list is root `CLAUDE.md` section 6
("Full stack"); background in `docs/containers.md` ("Locally").

1. **Preconditions** (check, do not create silently):
   - `../platform` exists and is set up as a local platform (its `.env` with the two `COMPOSE_*` lines, its
     `caddy.env` = this repo's `deploy/local-caddy.env`).
   - This repo's root `.env` has `DATABASE_OWNER_URL` / `DATABASE_APP_URL`, and `backend/.env` exists.
   If one is missing, say which and ask the owner before running provision-app (it writes credentials).
2. **Start**:
   ```bash
   P=$(cd ../platform && pwd); export PLATFORM_DIR=$P
   (cd "$P" && scripts/app-networks sync && docker compose up -d --wait)
   docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
   "$P/scripts/install-site" anthonyzng-web deploy/anthonyzng-web.caddy
   ```
   Run the build in the background; it takes minutes.
3. **Check**: `docker compose -f docker-compose.yml -f docker-compose.local.yml ps` (all healthy, `migrate`
   exited 0), then open http://localhost:8080 with the preview tool and read the console for CSP errors.
   Logs: `docker compose -f docker-compose.yml -f docker-compose.local.yml logs --tail 100 backend`.
4. **After a snippet change**: run `install-site` again. After an edit of the platform's `caddy.env`:
   `(cd "$P" && docker compose up -d caddy)` first.
5. **Stop**: `docker compose -f docker-compose.yml -f docker-compose.local.yml down` (the data stays in the
   platform's database). Never `down -v`, never touch the dev database project `anthonyzng-web-dev`.
