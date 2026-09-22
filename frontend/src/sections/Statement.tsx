import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useStatementReveal } from '../animations/useStatementReveal'
import type { LanguageCode } from '../i18n/languages'
import { STATEMENT_ID } from './sectionIds'

/**
 * "In brief": the intro sentence as a standfirst, pinned on desktop while its lines rise.
 * Twin text: screen readers get one clean sr-only <p>; the aria-hidden visual copy is the only
 * SplitText target (so no aria-label ever lands on a <p>). The copy is keyed by language because
 * SplitText's revert recreates text nodes React no longer references.
 * The id is a landing target for language switches only; no nav link points to it.
 */
export function Statement() {
  const { t, i18n } = useTranslation()
  const language = i18n.language as LanguageCode
  const scope = useRef<HTMLElement>(null)
  useStatementReveal(scope, language)

  return (
    <section ref={scope} id={STATEMENT_ID} aria-labelledby="statement-title" className="relative">
      {/* The pin targets this child, never the section itself. */}
      <div data-pin className="flex items-center md:min-h-hero">
        <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 md:py-16">
          <div data-reveal="rule" aria-hidden="true" className="h-px w-full origin-left bg-line" />
          <h2
            id="statement-title"
            data-reveal="label"
            className="mt-8 font-mono text-sm uppercase tracking-label text-accent"
          >
            {t('home.statement.label')}
          </h2>
          <p className="sr-only">{t('home.intro')}</p>
          <p key={language} data-split aria-hidden="true" className="mt-8 max-w-4xl text-statement font-medium text-pretty">
            {t('home.intro')}
          </p>
        </div>
      </div>
    </section>
  )
}
