import { gsap, headerOffset } from './gsap'

/**
 * How far the reading line (the bottom edge of the sticky header) is into the landing region with
 * this id, from 0 to 1. A pinned region's spacer lives inside its section, so the section's height
 * is its whole scroll range.
 */
export function readProgress(id: string): number {
  const region = document.getElementById(id)
  if (!region) return 0
  const { top, height } = region.getBoundingClientRect()
  return height > 0 ? gsap.utils.clamp(0, 1, (headerOffset() - top) / height) : 0
}

/** The scroll position that puts the reading line `progress` of the way into the region, in the current layout. */
export function progressTarget(id: string, progress: number): number | null {
  const region = document.getElementById(id)
  if (!region) return null
  const { top, height } = region.getBoundingClientRect()
  return Math.max(0, window.scrollY + top - headerOffset() + progress * height)
}
