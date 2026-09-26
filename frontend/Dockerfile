# syntax=docker/dockerfile:1
# Frontend image: the Vite build served as static files by an unprivileged nginx on port 8080.
# VITE_* values are compiled into the bundle, so they are build arguments (public values only).

# --- build ----------------------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
ARG VITE_API_BASE_URL
ARG VITE_TURNSTILE_SITE_KEY
# Build args are in the environment of `npm run build` (typecheck + vite build), which Vite reads.
# Both are required: an empty value would silently fall back to the development default in
# src/env.ts (localhost, Cloudflare's test key).
RUN for name in VITE_API_BASE_URL VITE_TURNSTILE_SITE_KEY; do \
      if [ -z "$(printenv "$name")" ]; then echo "build arg $name is required" >&2; exit 1; fi; \
    done \
    && npm run build

# --- runtime --------------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
