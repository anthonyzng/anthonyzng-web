import { useEffect } from 'react'
import type { LandingId } from '../sections/sectionIds'
import { ACTIVE_ROOT_MARGIN } from './motion'
import { useSetActiveSection } from './useSmoothScroll'

/**
 * Tracks which region crosses a thin band near the viewport centre and publishes it for the nav
 * (aria-current) and the language switcher (the hash it lands on). The statement has no nav link, so
 * it only ever reaches the switcher. Needs no GSAP and works under reduced motion; without
 * IntersectionObserver nothing is highlighted. The hero produces null.
 */
export function useActiveSection(ids: readonly LandingId[]): void {
  const setActiveSection = useSetActiveSection()

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        setActiveSection(ids.find((id) => visible.has(id)) ?? null)
      },
      { rootMargin: ACTIVE_ROOT_MARGIN },
    )
    for (const id of ids) {
      const section = document.getElementById(id)
      if (section) observer.observe(section)
    }
    return () => {
      observer.disconnect()
      setActiveSection(null)
    }
  }, [ids, setActiveSection])
}
