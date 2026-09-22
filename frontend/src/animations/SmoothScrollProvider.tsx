import Lenis from 'lenis'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useMatch } from 'react-router'
import { isLandingId, type LandingId } from '../sections/sectionIds'
import { gsap, ScrollTrigger } from './gsap'
import { ActiveSectionContext, SmoothScrollContext, type SmoothScrollApi } from './smoothScrollContext'
import { useMotionAllowed } from './useMotionAllowed'
import { useScrollAnchor } from './useScrollAnchor'
import { useScrollTriggerRefresh } from './useScrollTriggerRefresh'

/** gsap's default lag smoothing, restored when Lenis goes away. */
const LAG_THRESHOLD_MS = 500
const LAG_ADJUSTED_MS = 33

/**
 * Owns the single Lenis instance and bridges it to ScrollTrigger: gsap.ticker drives Lenis, so one
 * requestAnimationFrame loop serves both. Mounted once above the language routes, so it survives
 * /en <-> /zh-hant switches. Under reduced motion no Lenis is created and scrolling stays native.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const motionAllowed = useMotionAllowed()
  const [lenis, setLenis] = useState<Lenis | null>(null)
  const [activeSection, setActiveSection] = useState<LandingId | null>(null)
  const { pathname, hash } = useLocation()
  const onHome = useMatch('/:lang') !== null
  const previousPathname = useRef(pathname)

  useEffect(() => {
    if (!motionAllowed) return
    let instance: Lenis
    try {
      instance = new Lenis({
        autoRaf: false, // gsap.ticker drives it: one RAF for Lenis and ScrollTrigger
        lerp: 0.1,
        smoothWheel: true,
        wheelMultiplier: 1,
        syncTouch: false, // touch scrolling stays fully native
        anchors: false, // anchor clicks are handled by SectionLink / useScrollTo
        stopInertiaOnNavigate: true,
        autoResize: true,
      })
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[lenis] disabled', error)
      return // lenis stays null, so every caller uses its native fallback
    }
    instance.on('scroll', ScrollTrigger.update)
    const tick = (time: number) => instance.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    // The state mirrors an external instance that only exists once this effect has run.
    // oxlint-disable-next-line react/set-state-in-effect
    setLenis(instance)
    return () => {
      gsap.ticker.remove(tick)
      gsap.ticker.lagSmoothing(LAG_THRESHOLD_MS, LAG_ADJUSTED_MS)
      instance.destroy()
      setLenis(null)
    }
  }, [motionAllowed])

  // Reload starts at the top; a hash is landed by useHashScroll instead of the browser. Set through
  // ScrollTrigger: it writes its own stored value back to history.scrollRestoration after every refresh.
  useEffect(() => {
    if (typeof history === 'undefined' || !('scrollRestoration' in history)) return
    const previous = history.scrollRestoration
    ScrollTrigger.clearScrollMemory('manual')
    return () => {
      ScrollTrigger.clearScrollMemory(previous)
    }
  }, [])

  // A new page starts at the top, unless it is the home page landing its hash (useHashScroll lands only
  // those ids; any other hash, such as #main from the skip link, would keep a stale offset). Same-page
  // hash updates never reset. The home page refreshes ScrollTrigger itself before it lands; any other
  // page is refreshed here, after its own triggers exist, so the ones that outlive a page (the
  // header's progress rule) stop measuring the previous document.
  useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    if (onHome && isLandingId(hash.slice(1))) return
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true })
    else window.scrollTo(0, 0)
    if (!onHome) ScrollTrigger.refresh()
  }, [pathname, hash, onHome, lenis])

  useScrollTriggerRefresh()
  useScrollAnchor(lenis)

  const api = useMemo<SmoothScrollApi>(() => ({ lenis, setActiveSection }), [lenis])

  return (
    <SmoothScrollContext value={api}>
      <ActiveSectionContext value={activeSection}>{children}</ActiveSectionContext>
    </SmoothScrollContext>
  )
}
