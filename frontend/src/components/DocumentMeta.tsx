import { useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES, type LanguageCode } from '../i18n/languages'
import { homeUrl, OG_LOCALE, setCanonical, setMeta } from '../seo'

/**
 * Syncs <html lang>, the document title and the page's search / link-preview metadata with the page
 * language: meta description, canonical URL, Open Graph title, description, URL and locale (the
 * image, type and hreflang alternates are the same for every page and live in index.html, where
 * crawlers that run no script find them too).
 *
 * Render it before the page: layout effects run in tree order, so this one runs before the page's,
 * and html:lang() typography is in place when the home page measures its triggers and lands a hash,
 * and at the first paint. (A passive effect would run after both: a returning zh-Hant visitor on
 * /zh-hant#skills saw the landing measured with English line heights, then the heading jump when
 * the lang changed.)
 */
export function DocumentMeta({ language }: { language: LanguageCode }) {
  const { t } = useTranslation()

  useLayoutEffect(() => {
    const title = t('meta.title')
    const description = t('meta.description')
    const url = homeUrl(language)
    document.documentElement.lang = language
    document.title = title
    setMeta('name', 'description', description)
    setCanonical(url)
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', url)
    setMeta('property', 'og:locale', OG_LOCALE[language])
    // The other language (two languages: one alternate).
    const other = LANGUAGES.find((entry) => entry.code !== language)
    if (other) setMeta('property', 'og:locale:alternate', OG_LOCALE[other.code])
  }, [language, t])

  return null
}
