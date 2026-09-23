/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the backend, without a trailing slash. Defaults to the local dev server (see src/env.ts). */
  readonly VITE_API_BASE_URL?: string
  /** Cloudflare Turnstile site key. Defaults to Cloudflare's public always-pass test key. */
  readonly VITE_TURNSTILE_SITE_KEY?: string
}
