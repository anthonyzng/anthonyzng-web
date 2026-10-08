import { LANDING_IDS } from '../sections/sectionIds'

/**
 * "A section has reached the middle of the screen": the page backdrop answers with a shooting star
 * (dark) or a sway of the bamboo (light). The hero is index 0, then the landing sections in page
 * order. The first section seen after the page loads is not announced (nothing arrives on load).
 */
type Listener = (index: number) => void

const listeners = new Set<Listener>()

export function onSectionArrival(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The page's sections in order: the hero (`[data-hero]`), then each landing id present. */
export function arrivalSections(): HTMLElement[] {
  const hero = document.querySelector<HTMLElement>('[data-hero]')
  const rest = LANDING_IDS.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null)
  return hero ? [hero, ...rest] : rest
}

/** Watches the sections and announces each one that reaches the middle band of the screen. */
export function watchSectionArrivals(): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {}
  const sections = arrivalSections()
  let current: Element | null = null
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.target === current) continue
        const first = current === null
        current = entry.target
        if (first) continue
        const index = sections.indexOf(entry.target as HTMLElement)
        for (const listener of listeners) listener(index)
      }
    },
    { rootMargin: '-45% 0px -45% 0px' },
  )
  for (const section of sections) observer.observe(section)
  return () => observer.disconnect()
}
