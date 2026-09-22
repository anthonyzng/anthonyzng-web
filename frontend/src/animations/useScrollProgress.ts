import type { RefObject } from 'react'
import { gsap, MQ, runSafely, useGSAP } from './gsap'
import { EASE, SCRUB } from './motion'

/** Scrubs the element's scaleX from 0 to 1 across the whole document scroll (motion branches only). */
export function useScrollProgress(ref: RefObject<HTMLElement | null>): void {
  useGSAP(
    () => {
      const element = ref.current
      if (!element) return
      const mm = gsap.matchMedia()
      mm.add({ desktop: MQ.desktop, mobile: MQ.mobile }, (ctx) => {
        const { desktop, mobile } = ctx.conditions as Record<string, boolean>
        if (!desktop && !mobile) return
        const local = runSafely(() => {
          gsap.fromTo(
            element,
            { scaleX: 0 },
            { scaleX: 1, ease: EASE.none, scrollTrigger: { start: 0, end: 'max', scrub: SCRUB.parallax } },
          )
        })
        return () => local.revert()
      })
      return () => mm.revert()
    },
    { scope: ref },
  )
}
