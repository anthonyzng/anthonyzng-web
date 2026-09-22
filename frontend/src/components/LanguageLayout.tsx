import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useParams } from 'react-router'
import { DEFAULT_LANGUAGE, languageFromSlug, slugFromLanguage } from '../i18n/languages'
import { Footer } from './Footer'
import { Header } from './Header'

/** Layout for every "/:lang/*" route: syncs i18n with the URL and renders the page chrome. */
export function LanguageLayout() {
  const { lang } = useParams()
  const { t, i18n } = useTranslation()
  const language = languageFromSlug(lang)

  useEffect(() => {
    if (language && i18n.language !== language) void i18n.changeLanguage(language)
  }, [language, i18n])

  useEffect(() => {
    if (!language) return
    document.documentElement.lang = language
    document.title = t('meta.title')
  }, [language, t])

  if (!language) return <Navigate to={`/${slugFromLanguage(DEFAULT_LANGUAGE)}`} replace />
  // Render nothing for the one frame before i18n catches up with the URL.
  if (i18n.language !== language) return null

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
      >
        {t('nav.skipToContent')}
      </a>
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
