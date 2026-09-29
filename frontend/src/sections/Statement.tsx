import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { SPEED } from '../animations/motion'
import { useParallax } from '../animations/useParallax'
import { useStatementReveal } from '../animations/useStatementReveal'
import cats720 from '../assets/statement-cats-720.webp'
import cats1280 from '../assets/statement-cats-1280.webp'
import { useResolvedContent } from '../content/contentContext'
import type { LanguageCode } from '../i18n/languages'
import { STATEMENT_ID } from './sectionIds'

/**
 * "In brief": the intro sentence as a standfirst, pinned on desktop while its lines rise.
 * Twin text: screen readers get one clean sr-only <p>; the aria-hidden visual copy is the only
 * SplitText target (so no aria-label ever lands on a <p>). The copy is keyed by language and text
 * because SplitText's revert recreates text nodes React no longer references: new words (a language
 * switch, or the API's newer text replacing the snapshot's) get a fresh element and a fresh split.
 * The heading and the paragraph are content (the admin panel's site texts).
 * The id is a landing target for language switches only; no nav link points to it.
 * Behind the text, the owner's two cats: a monochrome photo (`.statement-photo` in index.css) that
 * surfaces from the right edge through soft masks, blended into the page in either theme and faint
 * where the text runs, drifting slowly with the scroll (a `[data-speed]` layer). Decorative.
 */
export function Statement() {
  const { i18n } = useTranslation()
  const { statement } = useResolvedContent()
  const language = i18n.language as LanguageCode
  const scope = useRef<HTMLElement>(null)
  useStatementReveal(scope, language, statement.intro)
  useParallax(scope)

  return (
    <section ref={scope} id={STATEMENT_ID} aria-labelledby="statement-title" className="relative">
      {/* The pin targets this child, never the section itself. */}
      <div data-pin className="relative isolate flex items-center overflow-hidden bg-bg md:min-h-hero">
        <div aria-hidden="true" data-speed={SPEED.statementPhoto} className="statement-photo">
          <img
            src={cats1280}
            srcSet={`${cats720} 720w, ${cats1280} 1280w`}
            sizes="100vw"
            width={1280}
            height={960}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 md:py-16">
          <div data-reveal="rule" aria-hidden="true" className="h-px w-full origin-left bg-line" />
          <h2
            id="statement-title"
            data-reveal="label"
            className="mt-8 font-mono text-sm uppercase tracking-label text-accent"
          >
            {statement.label}
          </h2>
          <p className="sr-only">{statement.intro}</p>
          <p key={`${language}:${statement.intro}`} data-split aria-hidden="true" className="mt-8 max-w-4xl text-statement font-medium text-pretty">
            {statement.intro}
          </p>
        </div>
      </div>
    </section>
  )
}
