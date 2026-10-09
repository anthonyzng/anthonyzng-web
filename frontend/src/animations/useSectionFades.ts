import { gsap, MQ, runSafely, ScrollTrigger, useGSAP } from './gsap'
import { SECTION_FADE } from './motion'
import { arrivalSections } from './sectionArrival'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (x: number) => x * x * (3 - 2 * x)

/**
 * Every home page section fades in as it scrolls into view and out as it leaves (opacity only: the
 * statement's pin must keep its fixed positioning, which a transform on the section would break).
 * One scroll-linked trigger over the whole page updates them all; the backdrop shows through as a
 * section fades. Hooked on the home page after the sections mount; `key` (the content's ids) rebuilds
 * it when the API adds or removes a section such as the archive. Reduced motion: nothing fades.
 */
export function useSectionFades(key: string): void {
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add({ desktop: MQ.desktop, mobile: MQ.mobile }, (ctx) => {
        const { desktop, mobile } = ctx.conditions as Record<string, boolean>
        if (!desktop && !mobile) return
        const sections = arrivalSections()
        const local = runSafely(() => {
          const apply = () => {
            const vh = window.innerHeight
            const band = vh * SECTION_FADE.band
            for (const section of sections) {
              const rect = section.getBoundingClientRect()
              // Not laid out (no height): left alone rather than faded to nothing.
              if (rect.height === 0) {
                section.style.opacity = ''
                continue
              }
              const enter = smooth(clamp01((vh - rect.top) / band))
              const leave = smooth(clamp01(rect.bottom / band))
              section.style.opacity = String(Math.round(Math.min(enter, leave) * 1000) / 1000)
            }
          }
          ScrollTrigger.create({ start: 0, end: 'max', onUpdate: apply, onRefresh: apply })
          apply()
        })
        return () => {
          local.revert()
          for (const section of sections) section.style.opacity = ''
        }
      })
      return () => mm.revert()
    },
    { dependencies: [key], revertOnUpdate: true },
  )
}
