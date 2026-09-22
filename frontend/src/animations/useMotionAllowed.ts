import { useSyncExternalStore } from 'react'
import { MOTION_QUERY, mediaMatches, watchMedia } from './media'

const subscribe = (onChange: () => void) => watchMedia(MOTION_QUERY, onChange)
const getSnapshot = () => mediaMatches(MOTION_QUERY)
const getServerSnapshot = () => false

/** True only when the user has no reduced-motion preference (and the browser can tell us so). */
export function useMotionAllowed(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
