import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { slugFromLanguage, type LanguageCode } from './languages'

/** Prefix an app path with the current language, e.g. "/" -> "/zh-hant". */
export function useLocalizedPath() {
  const { i18n } = useTranslation()
  const slug = slugFromLanguage(i18n.language as LanguageCode)
  return useCallback((path: string) => `/${slug}${path === '/' ? '' : path}`, [slug])
}
