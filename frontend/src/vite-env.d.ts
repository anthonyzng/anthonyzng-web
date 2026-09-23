/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Public contact address shown in the Contact section, injected at build time.
   * The value itself is never committed (CLAUDE.md 4.4); unset simply hides the email row.
   */
  readonly VITE_CONTACT_EMAIL?: string
}
