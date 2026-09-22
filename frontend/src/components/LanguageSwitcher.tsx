import { useEffect, useRef, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useMatch, useNavigate } from 'react-router'
import { focusState, useFocusRequest } from '../animations/navigationFocus'
import { readProgress } from '../animations/readingPosition'
import { isPlainLeftClick } from '../animations/useScrollTo'
import { useActiveSectionId } from '../animations/useSmoothScroll'
import { LANGUAGES, slugFromLanguage, type LanguageCode } from '../i18n/languages'

/** Sent with the switch, so the remounted switcher takes focus back. */
const LANGUAGE_FOCUS = focusState('language')

/**
 * Links to the same page in every other language by swapping the URL prefix. On the home page the
 * hash is the region being read (a section or the statement; none at the hero), never the URL hash:
 * that only changes on link clicks, so it goes stale as the reader scrolls. The click also carries
 * how far into that region the reader is (measured at click time), so switching language keeps the
 * reader where they are, including mid-way through the pinned statement.
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const { pathname, search, hash: locationHash, key } = useLocation()
  const onHome = useMatch('/:lang') !== null
  const activeSection = useActiveSectionId()
  const hash = onHome ? (activeSection ? `#${activeSection}` : '') : locationHash
  const current = i18n.language as LanguageCode
  const rest = pathname.replace(new RegExp(`^/${slugFromLanguage(current)}(?=/|$)`, 'i'), '')
  const root = useRef<HTMLDivElement>(null)
  const focusRequested = useFocusRequest('language')
  const navigate = useNavigate()

  // Progress changes while scrolling without re-rendering, so it is read at click time, not render time.
  const switchLanguage = (event: MouseEvent<HTMLAnchorElement>, to: string) => {
    if (!isPlainLeftClick(event)) return // new tab / window: let the browser handle the href
    event.preventDefault()
    const progress = onHome && activeSection ? readProgress(activeSection) : 0
    void navigate(to, { state: { ...LANGUAGE_FOCUS, progress } })
  }

  // The header remounts on a language switch, which drops focus to <body>: return it to the switcher.
  // preventScroll: the header is sticky, and focusing into it can otherwise move the landed page.
  useEffect(() => {
    if (focusRequested) root.current?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true })
  }, [focusRequested, key])

  return (
    <div ref={root} className="flex items-center font-mono text-sm">
      {LANGUAGES.map((lang, index) => {
        const active = lang.code === current
        const to = `/${lang.slug}${rest}${search}${hash}`
        return (
          <span key={lang.code} className="flex items-center">
            {index > 0 && <span aria-hidden="true" className="px-1 text-line">/</span>}
            {active ? (
              <span aria-current="true" className="inline-flex min-h-11 items-center px-1.5 text-fg">
                {lang.label}
              </span>
            ) : (
              <Link
                to={to}
                state={LANGUAGE_FOCUS}
                onClick={(event) => switchLanguage(event, to)}
                hrefLang={lang.code}
                // The name is in the page language; only the visible autonym is in the target language.
                aria-label={t('language.switchTo', { name: lang.name })}
                // 44px tall; ~30px wide, because a 44px width pushes the header past a 320px screen.
                className="inline-flex min-h-11 items-center justify-center px-2 text-muted transition-colors duration-200 hover:text-accent"
              >
                <span lang={lang.code}>{lang.label}</span>
              </Link>
            )}
          </span>
        )
      })}
    </div>
  )
}
