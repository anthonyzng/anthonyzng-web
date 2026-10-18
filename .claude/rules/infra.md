---
paths:
  - "deploy/**"
  - "docker-compose*.yml"
  - ".github/workflows/**"
  - "**/Dockerfile"
  - "db/**"
  - "docs/containers.md"
  - "docs/deployment.md"
---

# Infrastructure: platform, hosting, CI/CD

Loaded when working on deployment, containers or CI. Details: `docs/containers.md`, `docs/deployment.md`.

## Architecture

Each tier runs in its **own Docker container**. The site runs on the **Owwsolution platform** (the private repo `Owwsolution/platform`): the VM's edge proxy and its PostgreSQL instance belong to the platform and are shared with the other Owwsolution apps. This repo brings its frontend, backend and migration job, its Caddy site snippet and its own database (one database, two roles).

```
                       Internet
                          │
          owwsolution.com │ api.owwsolution.com
                ┌─────────▼──────────┐
                │ platform Caddy      │  auto-HTTPS; this site's routes: deploy/anthonyzng-web.caddy
                └───┬────────────┬───┘
                    │ edge       │ edge          (edge-anthonyzng-web: this site's own)
        ┌───────────▼──┐   ┌─────▼─────────┐
        │  frontend     │   │  backend       │
        │  React SPA    │   │  FastAPI       │
        │  (static)     │   │                │
        └──────────────┘   └─────┬─────────┘
                                 │ db (db-anthonyzng-web: this site's own)
                     ┌───────────▼──────────┐
                     │ platform PostgreSQL   │  database anthonyzng_web
                     └──────────────────────┘
```

- Hosting: **GCP Compute Engine VM** `anthonyzng-web` (`vm-1` in the platform's inventory, e2-small) running Docker + Docker Compose. **Every service runs in its own container**; nothing is installed directly on the host besides Docker. The platform lives in `/opt/platform`, this site's compose project in `/opt/apps/anthonyzng-web` (`docs/containers.md`).
- Domains: `owwsolution.com` + `www` (redirects to the apex) → frontend; `api.owwsolution.com` → backend. DNS: Cloudflare (nameservers `adele.ns.cloudflare.com`, `owen.ns.cloudflare.com`, registrar Namecheap), the three A records proxied (orange cloud), SSL/TLS mode Full (strict): Cloudflare in front gives DDoS protection, the CDN and Web Analytics; the platform's Caddy still holds the Let's Encrypt certificates (`docs/containers.md`, `docs/deployment.md`).
- Backups: a daily snapshot of the VM's disk (databases, Caddy certificates, `.env` files), kept 7 days, plus the platform's nightly `pg_dump` of `anthonyzng_web` in `/opt/platform/backups`, kept 7 days (`docs/deployment.md`).

## Stack

| Layer      | Choice |
|------------|--------|
| Proxy/TLS  | The Owwsolution platform's Caddy (automatic Let's Encrypt certificates); this site's hosts are `deploy/anthonyzng-web.caddy` |
| CI/CD      | GitHub Actions: lint/test → build images → push to GHCR → deploy to the platform VM over SSH (the platform's `scripts/deploy-app`) |
| Analytics  | Cloudflare Web Analytics (owner decision, Phase 8: no cookie, no container on the 1 GiB VM; enabled in the Cloudflare dashboard with automatic setup, which injects the beacon at the edge into HTML answers (`static.cloudflareinsights.com/beacon.min.js`, reporting to `cloudflareinsights.com`), both allowed by the CSP; verified in production 2026-09-25) |

## Files

```
anthonyzng-web/
├── db/
│   └── init/                   # Postgres init scripts (creates the `*_test` database on first start)
├── deploy/
│   ├── anthonyzng-web.caddy    # the site's hosts on the platform's Caddy: CSP and headers, www redirect, API host, body cap
│   ├── local-caddy.env         # the snippet's local addresses (a local platform's caddy.env)
│   └── ci/Caddyfile            # a copy of the platform's global Caddyfile, for CI's snippet check
└── .github/workflows/
    ├── ci-cd.yml               # CI on every PR / push; images to GHCR and deploy on main
    └── content-sync.yml        # daily: the content snapshot from production, as a pull request
```

## Operations

```bash
# Production: CI deploys (docs/deployment.md); on the VM: cd /opt/apps/anthonyzng-web && docker compose ps
```
