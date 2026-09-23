import type Lenis from 'lenis'
import { useEffect } from 'react'
import { ScrollTrigger } from './gsap'
import { readAnchor, restoreAnchor } from './readingPosition'

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
