/** Home page sections, in page order. The ids double as the URL hashes. */
export const SECTION_IDS = ['experience', 'projects', 'skills', 'contact'] as const

export type SectionId = (typeof SECTION_IDS)[number]

/** The numbered chapters ("01 / 03"): Contact is the closing screen, not a numbered section. */
export const NUMBERED_SECTION_IDS = ['experience', 'projects', 'skills'] as const

export type NumberedSectionId = (typeof NUMBERED_SECTION_IDS)[number]

/** "In brief" has no nav link, but a language switch made while reading it lands there. */
export const STATEMENT_ID = 'statement'

/** Every home page region a hash lands on, in page order: the statement, then the nav sections. */
export const LANDING_IDS = [STATEMENT_ID, ...SECTION_IDS] as const

export type LandingId = (typeof LANDING_IDS)[number]

export function isLandingId(value: string): value is LandingId {
  return (LANDING_IDS as readonly string[]).includes(value)
}

/** Zero-padded, one-based section number: 0 -> "01". */
export function formatIndex(index: number): string {
  return String(index + 1).padStart(2, '0')
}
