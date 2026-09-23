import type Lenis from 'lenis'
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

/** Where the reader is, in layout-independent terms. */
export interface ScrollAnchor {
  /** The child of <main> under the reading line (the bottom edge of the sticky header). */
  element: Element
  /** How far the reading line is into that element, from 0 to 1. */
  progress: number
}

export function readAnchor(): ScrollAnchor | null {
  const main = document.getElementById('main')
  if (!main) return null
  const line = headerOffset()
  let anchor: ScrollAnchor | null = null
  for (const element of main.children) {
    const { top, height } = element.getBoundingClientRect()
    if (anchor && top > line) break
    anchor = { element, progress: height > 0 ? gsap.utils.clamp(0, 1, (line - top) / height) : 0 }
  }
  return anchor
}

/** Scrolls so the anchor's element is again `progress` of the way past the reading line. */
export function restoreAnchor({ element, progress }: ScrollAnchor, lenis: Lenis | null): void {
  if (!element.isConnected) return
  const { top, height } = element.getBoundingClientRect()
  const target = Math.max(0, window.scrollY + top - headerOffset() + progress * height)
  if (lenis) {
    // The layout (or a native scroll) changed under Lenis, so its position and limit are stale.
    lenis.resize()
    lenis.scrollTo(target, { immediate: true, force: true })
    return
  }
  window.scrollTo(0, target)
}
