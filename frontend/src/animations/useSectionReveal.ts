import type { RefObject } from 'react'
import { gsap, MQ, runSafely, useGSAP } from './gsap'
import { DISTANCE, EASE, MOBILE_FACTOR, SCRUB, TRIGGER } from './motion'

/**
 * Scrubbed (so reversible) section entrance: the rule draws, the counter and tagline settle and the
 * heading rises out of its mask. Each `[data-reveal-item]` (an untransformed trigger wrapper) then
 * reveals its `[data-reveal-inner]` against its own position on the page.
 */
export function useSectionReveal(scope: RefObject<HTMLElement | null>): void {
  useGSAP(
    () => {
      const root = scope.current
      if (!root) return
      const mm = gsap.matchMedia()
      mm.add(
        { desktop: MQ.desktop, mobile: MQ.mobile },
        (ctx) => {
          const { desktop, mobile } = ctx.conditions as Record<string, boolean>
          if (!desktop && !mobile) return
          const k = desktop ? 1 : MOBILE_FACTOR
          const local = runSafely(() => {
            const q = (selector: string) => gsap.utils.toArray<HTMLElement>(selector, root)
            gsap
              .timeline({
                defaults: { ease: EASE.settle },
                scrollTrigger: { trigger: root, start: TRIGGER.enterStart, end: TRIGGER.enterEnd, scrub: SCRUB.reveal },
              })
              .fromTo(q('[data-reveal="rule"]'), { scaleX: 0 }, { scaleX: 1, ease: EASE.none, duration: 0.5 }, 0)
              .from(q('[data-reveal="label"]'), { opacity: 0, y: DISTANCE.label * k, duration: 0.4 }, 0.1)
              .from(q('[data-reveal="heading"]'), { yPercent: DISTANCE.mask, duration: 0.5, ease: EASE.reveal }, 0.15)
              .from(q('[data-reveal="tagline"]'), { opacity: 0, y: DISTANCE.tagline * k, duration: 0.4 }, 0.35)

            for (const item of q('[data-reveal-item]')) {
              const inner = item.querySelector<HTMLElement>('[data-reveal-inner]')
              if (!inner) continue
              gsap.from(inner, {
                opacity: 0,
                y: DISTANCE.item * k,
                ease: EASE.settle,
                scrollTrigger: { trigger: item, start: TRIGGER.itemStart, end: TRIGGER.itemEnd, scrub: SCRUB.reveal },
              })
            }
          }, root)
          return () => local.revert()
        },
        root,
      )
      return () => mm.revert()
    },
    { scope },
  )
}
