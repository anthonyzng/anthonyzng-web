/**
 * Contact channels, in display order. Plain data: the owner approved publishing every value here
 * (including the email address) on this public site, so they live in the repo like the rest of the
 * content. Labels are translated under `content.contact.labels.<id>`.
 */
export interface ContactLink {
  readonly id: string
  readonly href: string
  /** What the link shows: an address, a URL or a handle, never a translated string. */
  readonly display: string
}

export const CONTACT_EMAIL = 'anthonyzng075@gmail.com'

export const CONTACT_LINKS: readonly ContactLink[] = [
  { id: 'email', href: `mailto:${CONTACT_EMAIL}`, display: CONTACT_EMAIL },
  { id: 'linkedin', href: 'https://www.linkedin.com/in/anthonyzng/', display: 'linkedin.com/in/anthonyzng' },
  { id: 'github', href: 'https://github.com/anthonyzng', display: 'github.com/anthonyzng' },
]
