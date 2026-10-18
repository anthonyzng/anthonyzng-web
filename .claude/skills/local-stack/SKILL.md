---
name: local-stack
description: Start, rebuild, inspect or stop the full containerised stack on a local Owwsolution platform (http://localhost:8080). Use to test the Docker images, the Caddy snippet, the CSP or anything that only shows behind the proxy.
---

# Local full stack

Run from the repo root in Git Bash (the Bash tool). The full command list is in "Commands" below; background in `docs/containers.md` ("Locally").

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

## Commands

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
