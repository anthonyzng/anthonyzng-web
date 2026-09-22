import type Lenis from 'lenis'
import { useEffect } from 'react'
import { gsap, headerOffset, ScrollTrigger } from './gsap'

interface ScrollAnchor {
  /** The child of <main> under the reading line (the bottom edge of the sticky header). */
  element: Element
  /** How far the reading line is into that element, from 0 to 1. */
  progress: number
}

function readAnchor(): ScrollAnchor | null {
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

function restoreAnchor({ element, progress }: ScrollAnchor, lenis: Lenis | null): void {
  if (!element.isConnected) return
  const { top, height } = element.getBoundingClientRect()
  const target = Math.max(0, window.scrollY + top - headerOffset() + progress * height)
  if (lenis) {
    // ScrollTrigger moved the page natively, so Lenis's position and limit are stale.
    lenis.resize()
    lenis.scrollTo(target, { immediate: true, force: true })
    return
  }
  window.scrollTo(0, target)
}

/**
 * Keeps the reader in place when a breakpoint change rebuilds gsap.matchMedia branches (crossing
 * the md width or 600px tall, a tablet rotation, a split-view resize). ScrollTrigger records the scroll
 * position when a rebuild starts, but the triggers the new branches create, and killing every old one,
 * clear that record, so the rebuild's refresh leaves the page at the top.
 *
 * The position is therefore kept here as an anchor (the section under the header and how far into it
 * the reader is), taken whenever scrolling settles or a refresh finishes, and restored once the rebuild
 * has been refreshed. Anchoring to a section rather than to scrollY also absorbs the pin spacer
 * appearing or disappearing above the reader.
 */
export function useScrollAnchor(lenis: Lenis | null): void {
  useEffect(() => {
    let anchor = readAnchor()
    let refreshing = false
    let rebuilding = false

    const onScrollEnd = () => {
      if (!rebuilding) anchor = readAnchor()
    }
    const onRefreshInit = () => {
      refreshing = true
    }
    const onRefresh = () => {
      refreshing = false
      // The rebuild's own refresh runs before 'matchMedia' and must not overwrite the anchor.
      if (!rebuilding) anchor = readAnchor()
    }
    // Every refresh reverts all triggers between refreshInit and refresh; a revert outside a refresh
    // is matchMediaInit, the start of a rebuild.
    const onRevert = () => {
      if (!refreshing) rebuilding = true
    }
    const onRebuilt = () => {
      if (!rebuilding) return
      rebuilding = false
      if (anchor) restoreAnchor(anchor, lenis)
      anchor = readAnchor()
    }

    ScrollTrigger.addEventListener('scrollEnd', onScrollEnd)
    ScrollTrigger.addEventListener('refreshInit', onRefreshInit)
    ScrollTrigger.addEventListener('refresh', onRefresh)
    ScrollTrigger.addEventListener('revert', onRevert)
    ScrollTrigger.addEventListener('matchMedia', onRebuilt)
    return () => {
      ScrollTrigger.removeEventListener('scrollEnd', onScrollEnd)
      ScrollTrigger.removeEventListener('refreshInit', onRefreshInit)
      ScrollTrigger.removeEventListener('refresh', onRefresh)
      ScrollTrigger.removeEventListener('revert', onRevert)
      ScrollTrigger.removeEventListener('matchMedia', onRebuilt)
    }
  }, [lenis])
}
