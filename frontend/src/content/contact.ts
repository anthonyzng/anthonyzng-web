/**
 * Contact channels.
 *
 * The public links are plain data. The email address is deliberately NOT part of the repository
 * (CLAUDE.md 4.4: personal data never lands in committed files): it is injected at build time via
 * `VITE_CONTACT_EMAIL`, and the Contact section omits the email row while that variable is unset.
 * So the channel can never disappear silently, a production build without it warns
 * (`contactEmailCheck` in `vite.config.ts`); README and `.env.example` document the variable.
 */
export interface ContactLink {
  readonly id: string
  readonly href: string
  /** What the link shows: a URL or handle, never a translated string. */
  readonly display: string
}

export const CONTACT_LINKS: readonly ContactLink[] = [
  { id: 'github', href: 'https://github.com/anthonyzng', display: 'github.com/anthonyzng' },
]

/** Read at call time (not at module load) so a build or a test can supply the value. */
export function contactEmail(): string | null {
  const value = import.meta.env.VITE_CONTACT_EMAIL?.trim()
  return value ? value : null
}
