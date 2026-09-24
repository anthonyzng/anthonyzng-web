import type { RefObject } from 'react'
import { gsap, headerOffset, MQ, runSafely, useGSAP } from './gsap'
import { DISTANCE, EASE, mobileSpeed, SCRUB } from './motion'

export interface ParallaxOptions {
  /** 'center' (default): layers rest when the trigger is centred. 'start': layers rest at the start (hero). */
  origin?: 'center' | 'start'
  /** Default 'top bottom'. */
  start?: ScrollTrigger.Vars['start']
  /** Default 'bottom top'. */
  end?: ScrollTrigger.Vars['end']
  /** Scroll distance in px between start and end. Default: trigger height plus viewport height. */
  range?: (trigger: HTMLElement) => number
}

/** The hero sits under the sticky header: it starts at scroll 0 and ends fully hidden under the header. */
export const HERO_PARALLAX: ParallaxOptions = {
  origin: 'start',
  start: () => `top top+=${headerOffset()}`,
  end: () => `bottom top+=${headerOffset()}`,
  range: (hero) => hero.offsetHeight,
}

const defaultRange = (trigger: HTMLElement) => trigger.offsetHeight + window.innerHeight

/** Reads a numeric data attribute; null when absent or not a finite number. */
function numberData(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Scroll parallax for decorative layers inside `scope`:
 * - `[data-speed]` wrappers (optional `data-speed-x` xPercent drift on desktop, `data-fade-out` as a
 *   progress fraction) share one scrubbed timeline per scope;
 * - `[data-plane]` image planes drift inside their clipping frame.
 * Options are read once; pass a stable object. A changed `motionKey` (the section's item ids)
 * rebuilds everything, so planes that arrived with the API payload drift too.
 */
export function useParallax(
  scope: RefObject<HTMLElement | null>,
  options: ParallaxOptions = {},
  motionKey = '',
): void {
  useGSAP(
    () => {
      const root = scope.current
      if (!root) return
      const { origin = 'center', start = 'top bottom', end = 'bottom top', range = defaultRange } = options
      const mm = gsap.matchMedia()
      mm.add(
        { desktop: MQ.desktop, mobile: MQ.mobile },
        (ctx) => {
          const { desktop, mobile } = ctx.conditions as Record<string, boolean>
          if (!desktop && !mobile) return
          const local = runSafely(() => {
            const layers = gsap.utils.toArray<HTMLElement>('[data-speed]', root)
            if (layers.length > 0) {
              const tl = gsap.timeline({
                defaults: { ease: EASE.none, duration: 1 },
                scrollTrigger: { trigger: root, start, end, scrub: SCRUB.parallax, invalidateOnRefresh: true },
              })
              for (const layer of layers) {
                const raw = numberData(layer.dataset.speed)
                if (raw === null) continue
                const speed = desktop ? raw : mobileSpeed(raw)
                const distance = () => (1 - speed) * range(root)
                const driftX = desktop ? numberData(layer.dataset.speedX) : null
                const drift = driftX === null ? {} : { xPercent: driftX }
                const driftFrom = driftX === null ? {} : { xPercent: 0 }
                if (origin === 'start') {
                  tl.fromTo(layer, { y: 0, ...driftFrom }, { y: distance, ...drift }, 0)
                } else {
                  tl.fromTo(layer, { y: () => -distance() / 2, ...driftFrom }, { y: () => distance() / 2, ...drift }, 0)
                }
                const fade = numberData(layer.dataset.fadeOut)
                if (fade !== null && fade > 0) tl.to(layer, { opacity: 0, duration: fade }, 0)
              }
            }

            const travel = desktop ? DISTANCE.plane : DISTANCE.planeMobile
            for (const plane of gsap.utils.toArray<HTMLElement>('[data-plane]', root)) {
              // The overscan scale comes from GSAP, so without motion the plane rests at scale 1, filling its frame.
              gsap.set(plane, { scale: DISTANCE.planeScale })
              gsap.fromTo(
                plane,
                { yPercent: -travel },
                {
                  yPercent: travel,
                  ease: EASE.none,
                  scrollTrigger: {
                    trigger: plane.parentElement ?? plane,
                    start: 'top bottom',
                    end: 'bottom top',
                    scrub: SCRUB.parallax,
                  },
                },
              )
            }
          }, root)
          return () => local.revert()
        },
        root,
      )
      return () => mm.revert()
    },
    { scope, dependencies: [motionKey], revertOnUpdate: true },
  )
}
