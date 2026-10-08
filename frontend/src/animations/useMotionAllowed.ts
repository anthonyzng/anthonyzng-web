import { useCallback, useSyncExternalStore } from 'react'
import { MOTION_QUERY, mediaMatches, watchMedia } from './media'

const getServerSnapshot = () => false

/** Whether a media query matches, kept current as it changes. */
export function useMediaMatch(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => watchMedia(query, onChange), [query])
  const getSnapshot = useCallback(() => mediaMatches(query), [query])
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** True only when the user has no reduced-motion preference (and the browser can tell us so). */
export function useMotionAllowed(): boolean {
  return useMediaMatch(MOTION_QUERY)
}
