import { useEffect, type RefObject } from 'react'
import { isPhoneBudget } from './budget'
import { gsap } from './gsap'
import { bamboo, drawSpriteLeaf, leafSprite, makeCanvas, rng, stalkSpecs } from './inkPainting'
import { BACKDROP, CANVAS_BUDGET } from './motion'
import { onSectionArrival } from './sectionArrival'
import { canvasScale } from './resolution'

interface Stalk {
  canvas: HTMLCanvasElement
  width: number
  height: number
  x: number
  amp: number
  phase: number
  freq: number
}

interface Leaf {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  phase: number
  size: number
}

/** Width of each stalk's own canvas (room for its branches), CSS px. */
const STALK_WIDTH = 260

/**
 * The light theme's bamboo: one grove down both edges of the page, fixed behind every section (the
 * hero is see-through in light mode, so it stands there too). Each stalk is painted once to its own
 * canvas (`stalkSpecs`, seeded, so a resize repaints the same grove); when a section arrives the
 * stalks sway once about their roots, a damped swing of a degree or so, and the layer goes still. Now
 * and then a leaf drifts down from one edge (`leavesRef`). Between those the canvases are not
 * redrawn at all. Without motion: the grove, still, and no leaves.
 */
export function useBambooGrove(groveRef: RefObject<HTMLCanvasElement | null>, leavesRef: RefObject<HTMLCanvasElement | null>, motion: boolean): void {
  useEffect(() => {
    const grove = groveRef.current
    const leaves = leavesRef.current
    const g = grove?.getContext('2d')
    const lg = leaves?.getContext('2d')
    if (!grove || !leaves || !g || !lg) return
    const sprite = leafSprite()
    let width = 0
    let height = 0
    let scale = 1
    let stalks: Stalk[] = []
    const falling: Leaf[] = []
    let swayAt = -1
    let running = false
    let last = 0
    let timer = 0

    const size = () => {
      // The page's width without the scrollbar: the hero's painting is laid out on the same width.
      width = document.documentElement.clientWidth
      height = window.innerHeight
      scale = canvasScale(width, height, 1.25, CANVAS_BUDGET.backdrop)
      for (const c of [grove, leaves]) {
        c.width = Math.round(width * scale)
        c.height = Math.round(height * scale)
      }
      const sh = height + 80
      stalks = stalkSpecs(isPhoneBudget()).flatMap((spec) => {
        const canvas = makeCanvas(STALK_WIDTH * scale, sh * scale)
        const sg = canvas?.getContext('2d')
        if (!canvas || !sg) return []
        sg.setTransform(scale, 0, 0, scale, 0, 0)
        bamboo(sg, STALK_WIDTH / 2, -40, sh, spec.thick, spec.alpha, spec.lean, true, rng(spec.seed), spec.side)
        return [{ canvas, width: STALK_WIDTH, height: sh, x: spec.fx * width, amp: (0.012 + Math.random() * 0.01) * (spec.far ? 0.7 : 1), phase: Math.random() * Math.PI * 2, freq: 3.2 + Math.random() * 1.2 }]
      })
    }

    const drawGrove = (now: number): boolean => {
      const t = swayAt < 0 ? Infinity : (now - swayAt) / 1000
      g.setTransform(scale, 0, 0, scale, 0, 0)
      g.clearRect(0, 0, width, height)
      for (const s of stalks) {
        const angle = t < BACKDROP.sway ? s.amp * Math.exp(-t * 1.3) * Math.sin(t * s.freq + s.phase) * Math.min(1, t * 6) : 0
        g.save()
        g.translate(s.x, height + 40) // the root, just below the screen
        g.rotate(angle)
        g.drawImage(s.canvas, -s.width / 2, -s.height, s.width, s.height)
        g.restore()
      }
      return t < BACKDROP.sway
    }

    const drawLeaves = (dt: number, t: number) => {
      lg.setTransform(scale, 0, 0, scale, 0, 0)
      lg.clearRect(0, 0, width, height)
      if (!sprite) return
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i]
        f.y += f.vy * dt
        f.x += (Math.sin(t * 1.1 + f.phase) * 24 + f.vx) * dt
        f.rot += Math.cos(t * 1.1 + f.phase) * 0.9 * dt
        if (f.y > height + 40) {
          falling.splice(i, 1)
          continue
        }
        drawSpriteLeaf(lg, sprite, f.x, f.y, f.rot, f.size, 0.5, 0.55 + 0.45 * Math.abs(Math.sin(t * 1.1 + f.phase)))
      }
    }

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const swaying = drawGrove(now)
      if (!swaying) swayAt = -1
      drawLeaves(dt, now / 1000)
      if (!swaying && falling.length === 0) stop()
    }
    const start = () => {
      if (running || !motion || document.hidden) return
      running = true
      last = performance.now()
      gsap.ticker.add(tick)
    }
    function stop() {
      if (!running) return
      running = false
      gsap.ticker.remove(tick)
    }

    const scheduleLeaf = () => {
      const [lo, hi] = BACKDROP.leafEvery
      timer = window.setTimeout(() => {
        if (!document.hidden && falling.length < 2) {
          const left = Math.random() < 0.5
          falling.push({ x: (left ? 0.02 + Math.random() * 0.14 : 0.84 + Math.random() * 0.14) * width, y: -30, vx: Math.random() * 12 - 6, vy: 22 + Math.random() * 10, rot: Math.random() * 6.28, phase: Math.random() * 6.28, size: 0.7 + Math.random() * 0.3 })
          start()
        }
        scheduleLeaf()
      }, (lo + Math.random() * (hi - lo)) * 1000)
    }

    size()
    drawGrove(0)
    // Repainting every stalk is not free: once the window has settled.
    let resizeTimer = 0
    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        size()
        drawGrove(performance.now())
      }, 150)
    }
    window.addEventListener('resize', onResize)
    const stopArrivals = onSectionArrival(() => {
      if (!motion) return
      swayAt = performance.now()
      start()
    })
    const onVisibility = () => (document.hidden ? stop() : falling.length || swayAt >= 0 ? start() : undefined)
    document.addEventListener('visibilitychange', onVisibility)
    if (motion) scheduleLeaf()

    return () => {
      stop()
      window.clearTimeout(timer)
      window.clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      stopArrivals()
    }
  }, [groveRef, leavesRef, motion])
}
