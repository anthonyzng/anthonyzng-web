import { useCallback, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { DRIFT_X, SPEED } from '../animations/motion'
import { useBlackHole } from '../animations/useBlackHole'
import { HERO_PARALLAX, useParallax } from '../animations/useParallax'
import { useHeroIntro } from '../animations/useHeroIntro'
import { useInkStream } from '../animations/useInkStream'
import { useMotionAllowed } from '../animations/useMotionAllowed'
import { fileUrl } from '../api/files'
import { DownloadIcon } from '../components/DownloadIcon'
import { useResolvedContent } from '../content/contentContext'
import { formatFileSize } from '../i18n/formatFileSize'
import { useDocumentTheme } from '../theme/useDocumentTheme'

/**
 * The masthead. Type is the hero: the name in two huge lines over two static column rules, with the
 * roles as the deck. While it scrolls away its layers move slower than the page, at speeds that
 * decrease from top to bottom, so the clipped bottom edge swallows the deck first and the name last.
 * Outer `[data-speed]` wrappers belong to the parallax; inner `[data-intro]` elements to the intro.
 * Behind the text, a scene per theme, decorative and below every pointer target: in dark mode a
 * black hole that swallows the meteors the pointer throws (`useBlackHole`, WebGL, on the hero's own
 * night); in light mode an ink-wash stream among hills that catches the bamboo leaves the pointer
 * shakes loose (`useInkStream`), the hero see-through to the page's paper and bamboo grove.
 * Once a CV is uploaded, its download sits in the cell left of the roles, above the scroll cue.
 * The eyebrow, the name and the roles are content (the admin panel's site texts and hero roles).
 */
export function Hero() {
  const { t, i18n } = useTranslation()
  const { hero, cv } = useResolvedContent()
  const theme = useDocumentTheme()
  const scope = useRef<HTMLElement>(null)
  useHeroIntro(scope)
  useParallax(scope, HERO_PARALLAX)

  return (
    <section ref={scope} data-hero aria-labelledby="hero-title" className="relative isolate flex min-h-hero flex-col overflow-hidden dark:bg-bg">
      {theme === 'dark' ? <BlackHole scope={scope} /> : <InkStream scope={scope} />}
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
          {hero.eyebrow}
        </p>

        <div>
          <h1 id="hero-title" className="text-mega font-semibold">
            {/* wrap-anywhere: a name wider than the screen (text-spacing overrides) wraps instead of being cut. */}
            <span data-speed={SPEED.heroName1} data-speed-x={DRIFT_X.heroName1} className="block">
              <span className="mask-line mask-pad-mega">
                <span data-intro="name" className="block wrap-anywhere">
                  {hero.nameFirst}
                </span>
              </span>
            </span>
            {/* The literal space between the block spans keeps the two lines apart in the accessible name. */}{' '}
            <span
              data-speed={SPEED.heroName2}
              data-speed-x={DRIFT_X.heroName2}
              className="block text-right md:pl-[41.667%] md:text-left"
            >
              <span className="mask-line mask-pad-mega">
                <span data-intro="name" className="block wrap-anywhere">
                  {hero.nameLast}
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
                {hero.roles.map((role) => (
                  <li key={role.id}>
                    <span className="mask-line">
                      <span data-intro="role" className="flex gap-3">
                        <span aria-hidden="true" className="font-mono text-accent">
                          /
                        </span>
                        {/* Own span, so the role text is a single text match. */}
                        <span>{role.text}</span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div
              data-speed={SPEED.heroDeck}
              data-fade-out="0.2"
              className="self-end md:col-span-4 md:col-start-1 md:row-start-1"
            >
              <div data-intro="cue" className="flex flex-col items-start gap-8">
                {cv ? (
                  <a
                    href={fileUrl(cv.url)}
                    download
                    type="application/pdf"
                    className="group inline-flex min-h-11 items-center gap-3 rounded-full border border-line bg-surface/70 py-2 pl-4 pr-5 text-sm transition-colors duration-200 hover:border-accent"
                  >
                    <DownloadIcon className="size-4 text-accent transition-transform duration-300 ease-out-expo group-hover:translate-y-0.5 motion-reduce:transition-none" />
                    <span className="font-medium text-fg">{t('home.cv.download')}</span>{' '}
                    <span className="font-mono text-xs text-muted">
                      {t('home.cv.meta', { size: formatFileSize(cv.size, i18n.language) })}
                    </span>
                  </a>
                ) : null}
                <div aria-hidden="true" className="flex items-center gap-3 font-mono text-xs uppercase tracking-label text-muted">
                  <span className="relative h-12 w-px overflow-hidden bg-line">
                    <span className="scroll-cue-segment absolute inset-x-0 top-0 h-3 bg-accent" />
                  </span>
                  <span>{t('home.scrollCue')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </section>
  )
}

interface SceneProps {
  scope: RefObject<HTMLElement | null>
}

/** Dark: the black hole. Without WebGL, a still radial glow in its place. */
function BlackHole({ scope }: SceneProps) {
  const motion = useMotionAllowed()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [plain, setPlain] = useState(false)
  const unsupported = useCallback(() => setPlain(true), [])
  useBlackHole(scope, canvas, motion, unsupported)
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 -z-10 ${plain ? 'hero-void-fallback' : ''}`}>
      <canvas ref={canvas} className="size-full" />
    </div>
  )
}

/** Light: the stream, painted once (hills, banks, rocks) and live (water, leaves); both fade out at the hero's foot. */
function InkStream({ scope }: SceneProps) {
  const motion = useMotionAllowed()
  const still = useRef<HTMLCanvasElement>(null)
  const live = useRef<HTMLCanvasElement>(null)
  useInkStream(scope, still, live, motion)
  return (
    <div aria-hidden="true" className="hero-stream pointer-events-none absolute inset-0 -z-10">
      <canvas ref={still} className="absolute inset-0 size-full" />
      <canvas ref={live} className="absolute inset-0 size-full" />
    </div>
  )
}
