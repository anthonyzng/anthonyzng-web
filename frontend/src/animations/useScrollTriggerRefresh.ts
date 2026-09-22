import { useEffect } from 'react'
import { ScrollTrigger } from './gsap'
import { MOTION_QUERY, watchMedia } from './media'

/**
 * Requests a ScrollTrigger refresh whenever trigger positions may have moved: web fonts finishing
 * (including the Noto Sans TC subsets that load lazily once Chinese text first appears), a theme or
 * language change on <html>, and a reduced-motion preference change.
 * Colours are CSS variables, so a theme change needs no animation re-init, only a re-measure.
 *
 * It uses the safe `refresh(true)`: ScrollTrigger debounces it through its resize delay and, if the
 * reader is scrolling, waits for scrollEnd, so a late font load never forces a full re-measure mid-scroll.
 * Places that need exact positions at once (the home page mount, the hash landing) call refresh().
 */
export function useScrollTriggerRefresh(): void {
  useEffect(() => {
    let disposed = false
    const schedule = () => {
      if (!disposed) ScrollTrigger.refresh(true)
    }

    const fonts = typeof document === 'undefined' ? undefined : document.fonts
    fonts?.ready?.then(schedule, () => {})
    fonts?.addEventListener?.('loadingdone', schedule)

    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule)
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'lang'] })

    const unwatchMotion = watchMedia(MOTION_QUERY, schedule)

    return () => {
      disposed = true
      fonts?.removeEventListener?.('loadingdone', schedule)
      observer?.disconnect()
      unwatchMotion()
    }
  }, [])
}
