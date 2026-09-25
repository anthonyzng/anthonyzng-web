import { slugFromLanguage, type LanguageCode } from './i18n/languages'

/**
 * The public origin search engines and link previews should use, whatever host serves the page
 * (a local build included): canonical URLs, hreflang alternates and Open Graph URLs are absolute.
 */
export const SITE_ORIGIN = 'https://owwsolution.com'

/** The canonical URL of a language's home page. */
export const homeUrl = (language: LanguageCode): string => `${SITE_ORIGIN}/${slugFromLanguage(language)}`

/** Open Graph locale per language (`zh_HK`: the Traditional Chinese copy is written for Hong Kong readers). */
export const OG_LOCALE: Record<LanguageCode, string> = { en: 'en_US', 'zh-Hant': 'zh_HK' }

/** Sets `<meta name|property="key" content>` in <head>, creating the element once. */
export function setMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.append(element)
  }
  element.content = content
}

/** Sets `<link rel="canonical" href>` in <head>, creating the element once. */
export function setCanonical(href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.append(element)
  }
  element.href = href
}
