import { useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveLanguage } from '../../i18n/languages'

/**
 * While the admin panel is mounted: `<html lang>` follows the admin language, and a robots meta
 * keeps the panel out of search indexes. Unmounting removes the meta and restores the site's title
 * and language (a public page sets its own again as it mounts).
 */
export function useAdminDocument(): void {
  const { i18n } = useTranslation()
  const language = resolveLanguage(i18n.language)

  useLayoutEffect(() => {
    // The chunk loaded: a later failure may reload once again (see the lazy import in App.tsx).
    try {
      sessionStorage.removeItem('admin:reloaded')
    } catch {
      // No storage: App.tsx never reloads then either.
    }
    const root = document.documentElement
    const previous = { lang: root.lang, title: document.title }
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    robots.dataset.admin = ''
    document.head.append(robots)
    return () => {
      robots.remove()
      root.lang = previous.lang
      document.title = previous.title
    }
  }, [])

  useLayoutEffect(() => {
    document.documentElement.lang = language
  }, [language])
}
