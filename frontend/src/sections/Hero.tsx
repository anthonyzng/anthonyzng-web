import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { DRIFT_X, SPEED } from '../animations/motion'
import { HERO_PARALLAX, useParallax } from '../animations/useParallax'
import { useHeroIntro } from '../animations/useHeroIntro'
import { useInkWash } from '../animations/useInkWash'

const ROLES = ['fullStack', 'ai', 'manager'] as const

/**
 * The masthead. Type is the hero: the name in two huge lines over two static column rules, with the
 * roles as the deck. While it scrolls away its layers move slower than the page, at speeds that
 * decrease from top to bottom, so the clipped bottom edge swallows the deck first and the name last.
 * Outer `[data-speed]` wrappers belong to the parallax; inner `[data-intro]` elements to the intro.
 * Over it all, the ink wash (`useInkWash`) washes the hero into the page as it leaves; its canvas is
 * decorative, lets every pointer event through and stays empty without motion or WebGL.
 */
export function Hero() {
  const { t } = useTranslation()
  const scope = useRef<HTMLElement>(null)
  const ink = useRef<HTMLCanvasElement>(null)
  useHeroIntro(scope)
  useParallax(scope, HERO_PARALLAX)
  useInkWash(scope, ink)

  return (
    <section ref={scope} aria-labelledby="hero-title" className="relative flex min-h-hero flex-col overflow-hidden">
      {/* Column rules: md+ only, a static reference frame drawn in by the intro. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden md:block">
        <div className="mx-auto h-full max-w-6xl px-5 sm:px-8">
          <div className="relative h-full">
            <span data-intro="draw-y" className="absolute inset-y-0 left-[41.667%] w-px origin-top bg-line" />
            <span data-intro="draw-y" className="absolute inset-y-0 right-0 w-px origin-top bg-line" />
          </div>
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-between px-5 pb-10 pt-10 sm:px-8 md:pb-12 md:pt-14">
        <p data-intro="eyebrow" className="font-mono text-sm uppercase tracking-label text-accent">
          {t('home.eyebrow')}
        </p>

        <div>
          <h1 id="hero-title" className="text-mega font-semibold">
            {/* wrap-anywhere: a name wider than the screen (text-spacing overrides) wraps instead of being cut. */}
            <span data-speed={SPEED.heroName1} data-speed-x={DRIFT_X.heroName1} className="block">
              <span className="mask-line mask-pad-mega">
                <span data-intro="name" className="block wrap-anywhere">
                  {t('home.nameFirst')}
                </span>
              </span>
            </span>
            {/* The literal space between the block spans keeps the accessible name "Anthony Ng". */}{' '}
            <span
              data-speed={SPEED.heroName2}
              data-speed-x={DRIFT_X.heroName2}
              className="block text-right md:pl-[41.667%] md:text-left"
            >
              <span className="mask-line mask-pad-mega">
                <span data-intro="name" className="block wrap-anywhere">
                  {t('home.nameLast')}
                </span>
              </span>
            </span>
          </h1>

          <div data-speed={SPEED.heroRule} className="mt-8">
            <div data-intro="draw-x" aria-hidden="true" className="h-px w-full origin-left bg-line" />
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-12">
            <div data-speed={SPEED.heroDeck} className="md:col-span-7 md:col-start-6 md:row-start-1">
              <ul className="flex flex-col gap-2 text-title font-medium">
                {ROLES.map((role) => (
                  <li key={role}>
                    <span className="mask-line">
                      <span data-intro="role" className="flex gap-3">
                        <span aria-hidden="true" className="font-mono text-accent">
                          /
                        </span>
                        {/* Own span, so the role text is a single text match. */}
                        <span>{t(`home.roles.${role}`)}</span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div
              data-speed={SPEED.heroDeck}
              data-fade-out="0.2"
              aria-hidden="true"
              className="self-end md:col-span-4 md:col-start-1 md:row-start-1"
            >
              <div data-intro="cue" className="flex items-center gap-3 font-mono text-xs uppercase tracking-label text-muted">
                <span className="relative h-12 w-px overflow-hidden bg-line">
                  <span className="scroll-cue-segment absolute inset-x-0 top-0 h-3 bg-accent" />
                </span>
                <span>{t('home.scrollCue')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <canvas ref={ink} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />
    </section>
  )
}
