/**
 * Build-time configuration, read once from Vite's `import.meta.env`. Both values are public: they
 * are compiled into the bundle. `frontend/.env.example` documents them; the defaults below are the
 * local development values, so a checkout runs against a local backend with no `.env` at all.
 */

/** Backend origin, no trailing slash: the API lives under `${API_BASE_URL}/api/v1`. */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:8000').replace(/\/+$/, '')

/** Cloudflare's public "always passes" test site key, never valid in production. */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || '1x00000000000000000000AA'
