import { useEffect, type RefObject } from 'react'
import { gsap, headerOffset } from './gsap'
import { BELOW_MD, mediaMatches } from './media'

/** Kept clear of the header and of the screen's foot (px). */
const EDGE = 12
/** How far the glass reaches past a content box: sideways, and above and below it (px; desktop, phone). */
const PAD_X = 4
const PAD_Y = { desktop: 40, phone: 28 }
/** No scroll event for this long (ms): the page rests, and the glass thickens. */
const REST_MS = 220
/** How quickly the glass catches up with where it should be (per second). */
const FOLLOW_RATE = 12

interface Box {
  element: HTMLElement
  /** The box's own vertical padding (Statement and Archive carry some, the chapters none). */
  padTop: number
  padBottom: number
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Drives the page's one glass (`PageGlass`, the owner's pick of two prototypes): every
 * `[data-glass-box]` (the text of In brief, the chapters and the archive) is a place it may stand. It
 * wraps the box nearest the middle of the screen, clipped to the screen, and glides and resizes to the
 * next box as the reader moves on; the hero and the contact screen have no box, so it fades out over
 * them. While the page moves it gets `data-moving` (its tint thins and the backdrop shows through);
 * once the scroll rests the tint thickens and the text reads off a calm surface. Positioned
 * with a transform, sized in px, only while something changes (gsap's ticker); hidden when no box is in
 * view. Reduced motion: it jumps to its place instead of gliding. `key` changes when the set of
 * sections does (the archive, with the API's content).
 */
export function usePageGlass(glassRef: RefObject<HTMLElement | null>, motion: boolean, key: string): void {
  useEffect(() => {
    const glass = glassRef.current
    if (!glass) return
    let boxes: Box[] = []
    const measureBoxes = () => {
      boxes = [...document.querySelectorAll<HTMLElement>('[data-glass-box]')].map((element) => {
        const style = getComputedStyle(element)
        return { element, padTop: parseFloat(style.paddingTop) || 0, padBottom: parseFloat(style.paddingBottom) || 0 }
      })
    }
    measureBoxes()

    let current: Rect | null = null
    let presence = 0
    let running = false
    let last = 0
    let restTimer: ReturnType<typeof setTimeout> | undefined
    let restedAt = performance.now()

    const target = (): { rect: Rect | null; presence: number } => {
      const vh = window.innerHeight
      const top = headerOffset() + EDGE
      const bottom = vh - EDGE
      const padY = mediaMatches(BELOW_MD) ? PAD_Y.phone : PAD_Y.desktop
      const spans = boxes.map(({ element, padTop, padBottom }) => {
        const r = element.getBoundingClientRect()
        return { x: r.left + PAD_X, w: r.width - PAD_X * 2, top: r.top + padTop - padY, bottom: r.bottom - padBottom + padY }
      })
      if (spans.length === 0) return { rect: null, presence: 0 }
      // The box nearest the middle of the screen, clipped to the screen.
      const middle = vh / 2
      const distance = (s: (typeof spans)[number]) => (middle < s.top ? s.top - middle : middle > s.bottom ? middle - s.bottom : 0)
      const near = spans.reduce((best, s) => (distance(s) < distance(best) ? s : best))
      const y0 = Math.max(near.top, top)
      const y1 = Math.min(near.bottom, bottom)
      const visible = y1 - y0
      if (visible <= 0) return { rect: null, presence: 0 }
      return { rect: { x: near.x, y: y0, w: near.w, h: visible }, presence: Math.min(1, visible / 140) }
    }

    const draw = () => {
      if (!current) {
        glass.style.visibility = 'hidden'
        return
      }
      glass.style.transform = `translate3d(${current.x.toFixed(1)}px, ${current.y.toFixed(1)}px, 0)`
      glass.style.width = `${Math.max(0, current.w).toFixed(1)}px`
      glass.style.height = `${Math.max(0, current.h).toFixed(1)}px`
      glass.style.opacity = presence.toFixed(3)
      glass.style.visibility = presence < 0.005 ? 'hidden' : 'visible'
    }

    const step = (dt: number): boolean => {
      const goal = target()
      const k = motion ? 1 - Math.exp(-dt * FOLLOW_RATE) : 1
      let moving = false
      if (goal.rect) {
        if (!current || presence < 0.01) current = { ...goal.rect }
        else {
          for (const side of ['x', 'y', 'w', 'h'] as const) {
            const d = goal.rect[side] - current[side]
            current[side] += d * k
            if (Math.abs(d) > 0.5) moving = true
          }
        }
      }
      const dp = goal.presence - presence
      presence += dp * k
      if (Math.abs(dp) > 0.004) moving = true
      else presence = goal.presence
      draw()
      return moving
    }

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const moving = step(dt)
      // Keep going while the scroll is live (Lenis glides on after the last event) or the glass still travels.
      if (!moving && now - restedAt > 120) stop()
    }
    const start = () => {
      if (running) return
      running = true
      last = performance.now()
      gsap.ticker.add(tick)
    }
    function stop() {
      if (!running) return
      running = false
      gsap.ticker.remove(tick)
    }

    const onScroll = () => {
      glass.dataset.moving = ''
      clearTimeout(restTimer)
      restTimer = setTimeout(() => {
        delete glass.dataset.moving
        restedAt = performance.now()
      }, REST_MS)
      restedAt = Number.POSITIVE_INFINITY
      start()
    }
    const onResize = () => {
      measureBoxes()
      restedAt = performance.now()
      start()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    // Content above can change height (the API's content, fonts): follow the boxes as they move.
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize)
    for (const { element } of boxes) resize?.observe(element)

    step(1)
    restedAt = performance.now()

    return () => {
      stop()
      clearTimeout(restTimer)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      resize?.disconnect()
      delete glass.dataset.moving
    }
  }, [glassRef, motion, key])
}
