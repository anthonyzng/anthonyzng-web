import type { RefObject } from 'react'
import { gsap, MQ, runSafely, useGSAP } from './gsap'
import { DISTANCE, DURATION, EASE, INTRO_MOBILE_FACTOR, STAGGER } from './motion'

/**
 * Set when the intro completes (not when it starts): under StrictMode the first run is reverted
 * before completing, so the dev intro still plays. A language switch does not replay it.
 */
let heroIntroPlayed = false

/**
 * One-shot load timeline on the hero's `[data-intro]` inners. Skipped (the static state shows) once
 * played, on deep links and on a restored scroll position. Scroll parallax moves the outer wrappers,
 * so scrolling mid-intro never conflicts with it.
 */
export function useHeroIntro(scope: RefObject<HTMLElement | null>): void {
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
          if (heroIntroPlayed || window.location.hash || window.scrollY > 0) return
          const k = desktop ? 1 : INTRO_MOBILE_FACTOR
          const local = runSafely(() => {
            const q = (selector: string) => gsap.utils.toArray<HTMLElement>(selector, root)
            const tl = gsap.timeline({
              defaults: { ease: EASE.out },
              onComplete: () => {
                heroIntroPlayed = true
              },
            })
            // The column rules are display:none below md. Skipping them there also stops GSAP from
            // temporarily re-parenting the unrendered spans to measure their transforms.
            if (desktop) {
              tl.fromTo(
                q('[data-intro="draw-y"]'),
                { scaleY: 0 },
                { scaleY: 1, duration: DURATION.draw * k, stagger: STAGGER.rules * k },
                0,
              )
            }
            tl.fromTo(q('[data-intro="eyebrow"]'), { opacity: 0 }, { opacity: 1, duration: DURATION.base * k }, 0)
              .fromTo(
                q('[data-intro="name"]'),
                { yPercent: DISTANCE.maskMega },
                { yPercent: 0, duration: DURATION.intro * k, stagger: STAGGER.name * k },
                0.1 * k,
              )
              .fromTo(q('[data-intro="draw-x"]'), { scaleX: 0 }, { scaleX: 1, duration: DURATION.draw * k }, 0.45 * k)
              .fromTo(
                q('[data-intro="role"]'),
                { yPercent: DISTANCE.mask },
                { yPercent: 0, duration: DURATION.slow * k, stagger: STAGGER.roles * k },
                0.55 * k,
              )
              .fromTo(q('[data-intro="cue"]'), { opacity: 0 }, { opacity: 1, duration: DURATION.base * k }, 0.9 * k)
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
