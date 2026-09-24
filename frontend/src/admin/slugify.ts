/** The backend's slug rule: the content id, used by the site's code and in admin URLs. */
export const SLUG_PATTERN = /^[a-z][a-zA-Z0-9_-]{0,63}$/

/** `/admin/content/<collection>/new` is the create form, so no row may be called "new". */
export const RESERVED_SLUGS: readonly string[] = ['new']

/**
 * A slug suggestion from an English title: lower-case ASCII words joined by hyphens, accents folded
 * ("Café" -> "cafe"), starting with a letter and at most 64 characters, so the result always
 * matches `SLUG_PATTERN` or is empty (a title with no Latin letters has nothing to suggest).
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // the combining accents NFKD split off
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 64)
    .replace(/-+$/, '')
}
