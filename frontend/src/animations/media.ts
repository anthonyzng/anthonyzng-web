/** Motion is allowed only on a positive match; unsupported browsers count as "no motion". */
export const MOTION_QUERY = '(prefers-reduced-motion: no-preference)'

/**
 * Tailwind's md breakpoint (--breakpoint-md), written exactly as its md: variant compiles, so JS and
 * CSS switch layouts at the same width. A px value would drift apart as soon as the browser's default
 * font size is not 16px (48rem is 960px at 20px). Browsers without range syntax match neither query,
 * just as they never apply md: styles: they get the phone layout and the static page.
 */
export const MD_UP = '(width >= 48rem)'
export const BELOW_MD = '(width < 48rem)'

function mediaList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(query)
}

export function mediaMatches(query: string): boolean {
  return mediaList(query)?.matches ?? false
}

/** Subscribe to a media query's `change` event (with the legacy addListener fallback). Returns an unsubscribe function. */
export function watchMedia(query: string, callback: (matches: boolean) => void): () => void {
  const media = mediaList(query)
  if (!media) return () => {}
  const listener = (event: MediaQueryListEvent) => callback(event.matches)
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }
  media.addListener(listener)
  return () => media.removeListener(listener)
}
