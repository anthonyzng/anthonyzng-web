import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SPEED } from '../animations/motion'
import { useParallax } from '../animations/useParallax'
import { useSectionReveal } from '../animations/useSectionReveal'
import { formatIndex, NUMBERED_SECTION_IDS, type NumberedSectionId } from '../sections/sectionIds'
import { ReadingGlass } from './ReadingGlass'

interface SectionShellProps {
  id: NumberedSectionId
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
 * behind the content even where overflow: clip is unsupported. While the section is the one being read,
 * frosted glass sits behind its content (`ReadingGlass`); the content fades as a `[data-fade]` layer
 * beside it, never the section itself.
 */
export function SectionShell({ id, motionKey = '', children }: SectionShellProps) {
  const { t } = useTranslation()
  const scope = useRef<HTMLElement>(null)
  useSectionReveal(scope, motionKey)
  useParallax(scope, undefined, motionKey)

  const number = formatIndex(NUMBERED_SECTION_IDS.indexOf(id))
  const total = formatIndex(NUMBERED_SECTION_IDS.length - 1)

  return (
    <section ref={scope} id={id} aria-labelledby={`${id}-title`} className="relative isolate overflow-clip py-24 md:py-40">
      {/* Decorative: drawn as generated content (::before), so it is no text node that contrast
          checks or the accessibility tree would weigh; the section title says which section this is. */}
      <span
        aria-hidden="true"
        data-speed={SPEED.ghost}
        data-numeral={number}
        data-fade
        className="ghost-numeral pointer-events-none absolute right-5 top-12 -z-[1] select-none font-mono text-ghost tabular-nums text-line sm:right-8 md:top-20"
      />
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <ReadingGlass className="inset-x-1 -inset-y-10 sm:inset-x-3 md:-inset-y-14" />
        <div data-fade>
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
              {/* tabIndex -1: the focus target after anchor navigation. Not a control, so no focus ring
                  (iOS Safari draws one for a scripted focus after a tap), like the contact and archive titles. */}
              <h2
                id={`${id}-title`}
                tabIndex={-1}
                className="text-headline font-semibold text-balance outline-none"
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
      </div>
    </section>
  )
}
