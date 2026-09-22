import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { LANGUAGES, slugFromLanguage, type LanguageCode } from '../i18n/languages'

/** Links to the same page in every other language by swapping the URL prefix. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const { pathname, search, hash } = useLocation()
  const current = i18n.language as LanguageCode
  const rest = pathname.replace(new RegExp(`^/${slugFromLanguage(current)}(?=/|$)`, 'i'), '')

  return (
    <div className="flex items-center font-mono text-sm">
      {LANGUAGES.map((lang, index) => {
        const active = lang.code === current
        return (
          <span key={lang.code} className="flex items-center">
            {index > 0 && <span aria-hidden="true" className="px-1 text-line">/</span>}
            {active ? (
              <span aria-current="true" className="px-1.5 py-2 text-fg">
                {lang.label}
              </span>
            ) : (
              <Link
                to={`/${lang.slug}${rest}${search}${hash}`}
                lang={lang.code}
                hrefLang={lang.code}
                aria-label={t('language.switchTo', { name: lang.name })}
                className="px-1.5 py-2 text-muted transition-colors duration-200 hover:text-accent"
              >
                {lang.label}
              </Link>
            )}
          </span>
        )
      })}
    </div>
  )
}
