import { useCallback, type MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { LandingId } from '../sections/sectionIds'
import { gsap, headerOffset } from './gsap'
import { useMotionAllowed } from './useMotionAllowed'
import { useLenis } from './useSmoothScroll'

/** Scroll duration scales with distance (px per second), clamped to a comfortable range. */
const SCROLL_PX_PER_SECOND = 2500
const SCROLL_MIN_S = 0.8
const SCROLL_MAX_S = 1.6
const easeOutExpo = (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t))
const scrollDuration = (distance: number) =>
  gsap.utils.clamp(SCROLL_MIN_S, SCROLL_MAX_S, Math.abs(distance) / SCROLL_PX_PER_SECOND)

/** A primary-button click with no modifier keys: anything else (new tab, new window, ...) is left to the browser. */
export function isPlainLeftClick(event: MouseEvent): boolean {
  return (
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented
  )
}

export interface ScrollToSectionOptions {
  /** Jump without animating. */
  immediate?: boolean
  /** Move focus to the section heading once the scroll ends. */
  focus?: boolean
  /** Replace the URL hash with the section id (no new history entry). */
  updateHash?: boolean
}

/**
 * Section and top-of-page scrolling. Uses Lenis when it exists (it subtracts html's
 * scroll-padding-top itself), otherwise native scrollIntoView, which honours the same padding.
 */
export function useScrollTo() {
  const lenis = useLenis()
  const motionAllowed = useMotionAllowed()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()

  const scrollToSection = useCallback(
    (id: LandingId, { immediate = false, focus = true, updateHash = true }: ScrollToSectionOptions = {}) => {
      const section = document.getElementById(id)
      if (!section) return
      const heading = section.querySelector<HTMLElement>('h2[tabindex="-1"]')
      const focusHeading = () => {
        if (focus) heading?.focus({ preventScroll: true })
      }

      if (updateHash) void navigate({ pathname, search, hash: `#${id}` }, { replace: true })

      if (lenis) {
        lenis.scrollTo(section, {
          immediate,
          force: true, // robust even if the menu stopped Lenis a moment ago
          duration: scrollDuration(section.getBoundingClientRect().top - headerOffset()),
          easing: easeOutExpo,
          onComplete: focusHeading, // Lenis 1.3 also calls this for immediate scrolls
        })
        return
      }

      section.scrollIntoView({ behavior: immediate || !motionAllowed ? 'auto' : 'smooth', block: 'start' })
      focusHeading()
    },
    [lenis, motionAllowed, navigate, pathname, search],
  )

  const scrollToTop = useCallback(() => {
    void navigate({ pathname, search, hash: '' }, { replace: true })
    if (lenis) {
      lenis.scrollTo(0, { force: true, duration: scrollDuration(window.scrollY), easing: easeOutExpo })
      return
    }
    window.scrollTo({ top: 0, behavior: motionAllowed ? 'smooth' : 'auto' })
  }, [lenis, motionAllowed, navigate, pathname, search])

  return { scrollToSection, scrollToTop }
}
