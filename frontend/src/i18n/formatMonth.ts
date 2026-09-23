import { resolveLanguage } from './languages'

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/**
 * A `YYYY-MM` content date as a visible label in the active locale: "Nov 2023" in English,
 * "2023年11月" in Traditional Chinese — never English month names inside Chinese prose.
 *
 * Content stores only the machine-readable value, so the label and the `<time datetime>` attribute
 * are the same fact and cannot drift apart. A value that is not `YYYY-MM` is returned unchanged
 * rather than rendered as "NaN".
 */
export function formatMonth(iso: string, language: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const [, year, month] = match
  const index = Number(month) - 1
  if (index < 0 || index > 11) return iso
  return resolveLanguage(language) === 'zh-Hant' ? `${year}年${Number(month)}月` : `${EN_MONTHS[index]} ${year}`
}
