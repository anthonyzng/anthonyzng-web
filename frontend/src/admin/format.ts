import { resolveLanguage } from '../i18n/languages'

/** Intl locale for the admin language: Hong Kong conventions for Traditional Chinese. */
const intlLocale = (language: string): string => (resolveLanguage(language) === 'zh-Hant' ? 'zh-Hant-HK' : 'en')

/** An ISO 8601 timestamp in the reader's time zone, e.g. "Sep 23, 2026, 3:04 PM"; unparsable input is returned as is. */
export function formatDateTime(iso: string, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(intlLocale(language), { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const MB = 1024 * 1024

/**
 * Upload limits (contract): cover images up to 8 MB, the CV up to 10 MB. File sizes are shown with
 * `formatFileSize` (src/i18n), the same wording as the CV download on the public site.
 */
export const IMAGE_MAX_BYTES = 8 * MB
export const CV_MAX_BYTES = 10 * MB
