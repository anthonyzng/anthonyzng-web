import { useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { LanguageCode } from '../i18n/languages'

/**
 * Syncs <html lang> and the document title with the page language. Render it before the page:
 * layout effects run in tree order, so this one runs before the page's, and html:lang() typography
 * is in place when the home page measures its triggers and lands a hash, and at the first paint.
 * (A passive effect would run after both: a returning zh-Hant visitor on /zh-hant#skills saw the
 * landing measured with English line heights, then the heading jump when the lang changed.)
 */
export function DocumentMeta({ language }: { language: LanguageCode }) {
  const { t } = useTranslation()

  useLayoutEffect(() => {
    document.documentElement.lang = language
    document.title = t('meta.title')
  }, [language, t])

  return null
}
