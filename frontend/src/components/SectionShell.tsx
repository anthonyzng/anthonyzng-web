import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SPEED } from '../animations/motion'
import { useParallax } from '../animations/useParallax'
import { useSectionReveal } from '../animations/useSectionReveal'
import { formatIndex, SECTION_IDS, type SectionId } from '../sections/sectionIds'

interface SectionShellProps {
  id: SectionId
  headingSize?: 'headline' | 'display'
  /**
   * The ids of the section's items, joined. When the API payload adds or removes an item, the
   * reveal and parallax choreography is rebuilt for the new set of cards and rows.
   */
  motionKey?: string
  children: ReactNode
}

/**
 * Shared layout of a home page section: ghost numeral, drawn rule, sticky counter, masked heading,
 * tagline and the section's own content. `overflow-clip` contains the ghost without
 * creating a scroll container (so the CSS-sticky counter still works); `isolate` keeps the ghost
 * behind the content even where overflow: clip is unsupported.
 */
export function SectionShell({ id, headingSize = 'headline', motionKey = '', children }: SectionShellProps) {
  const { t } = useTranslation()
  const scope = useRef<HTMLElement>(null)
  useSectionReveal(scope, motionKey)
  useParallax(scope, undefined, motionKey)

  const number = formatIndex(SECTION_IDS.indexOf(id))
  const total = formatIndex(SECTION_IDS.length - 1)

  return (
    <section ref={scope} id={id} aria-labelledby={`${id}-title`} className="relative isolate overflow-clip py-24 md:py-40">
      <span
        aria-hidden="true"
        data-speed={SPEED.ghost}
        className="ghost-numeral pointer-events-none absolute right-5 top-12 -z-10 select-none font-mono text-ghost tabular-nums text-line sm:right-8 md:top-20"
      >
        {number}
      </span>
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div data-reveal="rule" aria-hidden="true" className="h-px w-full origin-left bg-line" />
        <div className="mt-10 grid gap-y-8 md:grid-cols-12 md:gap-x-8">
          <div className="md:col-span-3">
            <p
              data-reveal="label"
              className="font-mono text-sm uppercase tracking-label text-accent md:sticky md:top-[calc(var(--header-h)+2rem)]"
            >
              {t('sections.counter', { current: number, total })}
            </p>
          </div>
          <div className="md:col-span-9">
            {/* tabIndex -1: the focus target after anchor navigation. */}
            <h2
              id={`${id}-title`}
              tabIndex={-1}
              className={`${headingSize === 'display' ? 'text-display' : 'text-headline'} font-semibold text-balance`}
            >
              <span className="mask-line">
                <span data-reveal="heading" className="block">
                  {t(`sections.${id}.title`)}
                </span>
              </span>
            </h2>
            <p data-reveal="tagline" className="mt-6 max-w-xl text-lg text-muted">
              {t(`sections.${id}.tagline`)}
            </p>
            <div className="mt-14 md:mt-20">{children}</div>
          </div>
        </div>
      </div>
    </section>
  )
}
