import type { RefObject } from 'react'
import type { LanguageCode } from '../i18n/languages'
import { gsap, headerOffset, MQ, runSafely, ScrollTrigger, SplitText, useGSAP } from './gsap'
import { DISTANCE, EASE, MOBILE_FACTOR, PIN_LENGTH, SCRUB, STAGGER, TRIGGER } from './motion'
import { splitVarsFor } from './splitText'

/**
 * The statement: its rule and label arrive while the hero folds away; on desktop (wide, tall enough,
 * fine pointer, content fits) a child `[data-pin]` is pinned for PIN_LENGTH viewports while the `[data-split]`
 * visual copy rises line by line out of SplitText masks. Elsewhere there is no pin and the lines
 * reveal against the paragraph's own position.
 *
 * No trigger here sets invalidateOnRefresh: every tween value is static (function start/end values are
 * re-evaluated on each refresh anyway), and invalidating a scrubbed timeline of staggered from() tweens
 * drops the from-state of every line the playhead has not reached yet, showing it unmasked.
 *
 * The pin is standalone: SplitText's autoSplit re-splits after font loads or width changes and rebuilds
 * only the line timeline returned from onSplit, never the pin. A breakpoint change (for example only the
 * height crossing 600px) does re-create the pin, after the section triggers below it. ScrollTrigger
 * refreshes in list order, so the pin carries refreshPriority: that makes every refresh sort the list,
 * the pin first, so its spacer is always in place before the triggers below it are measured.
 *
 * No anticipatePin: the pin only exists where Lenis drives the scroll on the main thread (see MQ.pinnable),
 * so there is no threaded-scroll lag to hide, and anticipating would pin visibly early.
 */
export function useStatementReveal(scope: RefObject<HTMLElement | null>, language: LanguageCode): void {
  useGSAP(
    () => {
      const root = scope.current
      if (!root) return
      const mm = gsap.matchMedia()
      mm.add(
        { pinnable: MQ.pinnable, desktop: MQ.desktop, mobile: MQ.mobile },
        (ctx) => {
          const { pinnable, desktop, mobile } = ctx.conditions as Record<string, boolean>
          if (!desktop && !mobile) return
          const k = desktop ? 1 : MOBILE_FACTOR
          const local = runSafely(() => {
            const pinEl = root.querySelector<HTMLElement>('[data-pin]') // a child of the section, never the root
            const copy = root.querySelector<HTMLElement>('[data-split]') // the aria-hidden visual copy
            if (!pinEl || !copy) return
            const q = (selector: string) => gsap.utils.toArray<HTMLElement>(selector, root)
            // Fit guard: never pin content that is taller than the space under the header.
            const pin = pinnable && pinEl.offsetHeight <= window.innerHeight - headerOffset() + 1
            const pinStart = () => `top top+=${headerOffset()}`
            const pinEnd = () => `+=${window.innerHeight * PIN_LENGTH}`

            // 1. Rule and label arrive with the section (created first: earlier on the page).
            gsap
              .timeline({
                scrollTrigger: {
                  trigger: root,
                  start: 'top bottom',
                  end: pin ? pinStart : 'clamp(top 45%)',
                  scrub: pin ? SCRUB.parallax : SCRUB.reveal,
                },
              })
              .fromTo(q('[data-reveal="rule"]'), { scaleX: 0 }, { scaleX: 1, ease: EASE.none }, 0)
              .from(q('[data-reveal="label"]'), { opacity: 0, y: DISTANCE.label * k, ease: EASE.settle }, 0.2)

            // 2. The pin: standalone, independent of re-splits, always refreshed first.
            if (pin) {
              ScrollTrigger.create({
                trigger: pinEl,
                pin: true,
                pinSpacing: true,
                start: pinStart,
                end: pinEnd,
                refreshPriority: 1,
              })
            }

            // 3. Line reveal: its own non-pinning trigger on the (unpinned) section, same range as the pin.
            const range = (): ScrollTrigger.Vars =>
              pin
                ? { trigger: root, start: pinStart, end: pinEnd, scrub: SCRUB.pin }
                : { trigger: copy, start: TRIGGER.lineStart, end: TRIGGER.lineEnd, scrub: SCRUB.mobile }

            const localeVars = splitVarsFor(language)
            if (!localeVars) {
              // Chinese without Intl.Segmenter: reveal the paragraph as one block.
              gsap.from(copy, { opacity: 0, y: DISTANCE.tagline * k, ease: EASE.settle, scrollTrigger: range() })
              return
            }

            SplitText.create(copy, {
              type: 'lines',
              mask: 'lines',
              autoSplit: true,
              aria: 'none', // the copy is aria-hidden; the sr-only twin carries the accessible text
              ...localeVars,
              onSplit: (self) =>
                gsap
                  .timeline({ scrollTrigger: range() })
                  .from(self.lines, {
                    yPercent: DISTANCE.mask,
                    duration: 0.5,
                    stagger: STAGGER.statementLines,
                    ease: EASE.reveal,
                  })
                  // Hold: the sentence is fully readable before the pin releases.
                  .to({}, { duration: 0.3 }),
            })
          }, root)
          return () => local.revert()
        },
        root,
      )
      return () => mm.revert()
    },
    { scope, dependencies: [language], revertOnUpdate: true },
  )
}
