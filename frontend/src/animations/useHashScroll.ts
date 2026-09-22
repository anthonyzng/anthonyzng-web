import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { isLandingId, type LandingId } from '../sections/sectionIds'
import { ScrollTrigger, useGSAP } from './gsap'
import { useFocusRequest, useRequestedProgress } from './navigationFocus'
import { progressTarget } from './readingPosition'
import { useScrollTo } from './useScrollTo'
import { useLenis } from './useSmoothScroll'

const FONTS_WAIT_MS = 1000
/** Any of these means the reader has taken over, so a late correction must not move them. */
const READER_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

interface Landing {
  id: LandingId
  /**
   * Only a section link used from another page moves focus to the heading. Deep links, language
   * switches, Back/Forward and reloads do not.
   */
  focus: boolean
  /** How far into the region to land (0 to 1); only a language switch carries more than 0. */
  progress: number
}

/**
 * Call once in HomePage. As the parent of every section, its layout effect runs after all section
 * hooks have created their triggers (pin spacer included), so one refresh measures the final layout.
 * It then lands deep links (/en#projects), links from other pages and language switches before the
 * first paint, and corrects the landing once web fonts are ready.
 */
export function useHashScroll(): void {
  const { hash } = useLocation()
  const focusRequested = useFocusRequest('section')
  const requestedProgress = useRequestedProgress()
  const [landing] = useState<Landing | null>(() => {
    const id = hash.slice(1) // captured at mount
    return isLandingId(id) ? { id, focus: focusRequested, progress: requestedProgress } : null
  })
  const { scrollToSection } = useScrollTo()
  const lenis = useLenis()
  const settled = useRef(false)

  const land = useCallback(
    ({ id, focus, progress }: Landing) => {
      scrollToSection(id, { immediate: true, focus, updateHash: false })
      if (progress === 0) return
      // Measured in the new layout, so a longer or shorter translation still keeps the reader's place.
      const target = progressTarget(id, progress)
      if (target === null) return
      if (lenis) lenis.scrollTo(target, { immediate: true, force: true })
      else window.scrollTo(0, target)
    },
    [lenis, scrollToSection],
  )

  useGSAP(() => {
    ScrollTrigger.refresh()
    if (!landing) return
    // A language switch collapsed the document for a frame, so Lenis's position and limit are stale.
    lenis?.resize()
    land(landing)
  })

  // Font metrics can still shift the layout: once fonts are ready this is a few-pixel correction.
  useEffect(() => {
    if (!landing || settled.current) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const readerTookOver = () => {
      settled.current = true
      cancelled = true
    }
    for (const type of READER_INPUT) window.addEventListener(type, readerTookOver, { passive: true })

    const fontsReady = document.fonts?.ready ?? Promise.resolve()
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, FONTS_WAIT_MS)
    })
    void Promise.race([fontsReady, timeout])
      .catch(() => {})
      .then(() => {
        // A re-run (for example Lenis appearing) supersedes this one.
        if (cancelled) return
        settled.current = true
        lenis?.resize()
        ScrollTrigger.refresh()
        land({ ...landing, focus: false })
      })
    return () => {
      cancelled = true
      clearTimeout(timer)
      for (const type of READER_INPUT) window.removeEventListener(type, readerTookOver)
    }
  }, [landing, lenis, land])
}
