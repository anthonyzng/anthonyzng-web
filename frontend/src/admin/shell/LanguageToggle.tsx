import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES, resolveLanguage } from '../../i18n/languages'
import { ADMIN_NS } from '../i18n'

/**
 * EN / 繁 for the admin panel, which has no language prefix in its URLs: it switches i18next
 * directly (the language detector stores the choice in localStorage.lang, so the public site
 * opens in the same language). The active language is plain text; the other is a button, and
 * after a switch focus moves to the new button so a keyboard user is not dropped on <body>.
 */
export function LanguageToggle() {
  const { t, i18n } = useTranslation(ADMIN_NS)
  const current = resolveLanguage(i18n.language)
  const group = useRef<HTMLDivElement>(null)
  const switched = useRef(false)

  useEffect(() => {
    if (!switched.current) return
    switched.current = false
    group.current?.querySelector('button')?.focus()
  }, [current])

  return (
    <div ref={group} role="group" aria-label={t('language.label')} className="flex items-center font-mono text-sm">
      {LANGUAGES.map((lang, index) => (
        <span key={lang.code} className="flex items-center">
          {index > 0 ? (
            <span aria-hidden="true" className="px-1 text-line">
              /
            </span>
          ) : null}
          {lang.code === current ? (
            <span aria-current="true" lang={lang.code} className="inline-flex min-h-11 items-center px-1.5 text-fg">
              {lang.label}
            </span>
          ) : (
            <button
              type="button"
              aria-label={t('language.switchTo', { name: lang.name })}
              onClick={() => {
                switched.current = true
                void i18n.changeLanguage(lang.code)
              }}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center px-2 text-muted transition-colors duration-200 hover:text-accent"
            >
              <span lang={lang.code}>{lang.label}</span>
            </button>
          )}
        </span>
      ))}
    </div>
  )
}
