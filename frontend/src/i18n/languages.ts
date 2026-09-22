/** Supported locales. `code` is the i18next / BCP 47 tag, `slug` is the URL prefix. */
export const LANGUAGES = [
  { code: 'en', slug: 'en', label: 'EN', name: 'English' },
  { code: 'zh-Hant', slug: 'zh-hant', label: '繁', name: '繁體中文' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

export function languageFromSlug(slug: string | undefined): LanguageCode | null {
  return LANGUAGES.find((lang) => lang.slug === slug?.toLowerCase())?.code ?? null
}

export function slugFromLanguage(code: LanguageCode): string {
  return LANGUAGES.find((lang) => lang.code === code)!.slug
}

/** Map any browser/stored language tag (e.g. zh-TW, zh-HK, en-GB) onto a supported locale. */
export function resolveLanguage(tag: string | undefined | null): LanguageCode {
  const lower = tag?.toLowerCase() ?? ''
  if (lower.startsWith('zh')) return 'zh-Hant'
  return DEFAULT_LANGUAGE
}
