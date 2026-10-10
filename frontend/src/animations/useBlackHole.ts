import { useEffect, type RefObject } from 'react'
import { createBlackHole, type MeteorSegment } from './blackHole'
import { isPhoneBudget } from './budget'
import { gsap } from './gsap'
import { CANVAS_BUDGET, HERO_SCENE } from './motion'
import { canvasScale } from './resolution'

interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  trail: [number, number][]
}

/** Below this the frames are too slow (ms, smoothed) and the shader's resolution steps down. */
const SLOW_FRAME_MS = 26

/**
 * The dark hero's black hole (`blackHole.ts` draws it) and the meteors that fall into it: moving the
 * pointer over the hero (or touching it) throws a meteor from that point, aimed beside the hole so
 * it curves in under gravity; one that crosses the horizon flashes the photon ring. At most
 * `HERO_SCENE.meteors` at once. Phones without a hover pointer also get one now and then on their own.
 * Drawn at the device's resolution (capped at 1.5, or 1.25 on the phone budget, which also takes one
 * noise octave less, and within the shader's pixel budget, `canvasScale`, so a 4K screen shades about
 * 2 MP a frame, not 8); if frames run long the resolution steps down, never below `minScale`. Runs only
 * while the hero is on screen and the tab visible; without motion it draws one still frame and takes
 * no meteors. Without WebGL the canvas stays empty and `onUnsupported` lets the hero show a fallback.
 */
export function useBlackHole(
  scope: RefObject<HTMLElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  motion: boolean,
  onUnsupported: () => void,
): void {
  useEffect(() => {
    const root = scope.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    const renderer = createBlackHole(canvas)
    if (!renderer) {
      onUnsupported()
      return
    }
    const phone = isPhoneBudget()
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
    let width = 0
    let height = 0
    let k = 1
    let quality = 1
    let cx = 0
    let cy = 0
    let rs = 100
    let flash = 0
    const meteors: Meteor[] = []
    let visible = true
    let running = false
    let last = 0
    let slow = 0
    let ema = 16
    let idle = 0

    const size = () => {
      width = root.clientWidth
      height = root.clientHeight
      const dpr = canvasScale(width, height, phone ? 1.25 : 1.5, CANVAS_BUDGET.shader)
      canvas.width = Math.max(1, Math.round(width * dpr * quality))
      canvas.height = Math.max(1, Math.round(height * dpr * quality))
      k = canvas.width / Math.max(1, width)
      cx = width * 0.5
      cy = height * 0.46
      rs = Math.min(width, height) * (phone ? 0.15 : 0.12)
    }

    const draw = (time: number) => {
      const segments: MeteorSegment[] = meteors.map((m) => {
        const tail = m.trail[0]
        return {
          head: [m.x * k, (height - m.y) * k],
          tail: [tail[0] * k, (height - tail[1]) * k],
          brightness: Math.min(1, m.life * 5) * Math.min(1, (HERO_SCENE.meteorLife - m.life) * 2),
          width: 1.4 * k,
        }
      })
      renderer.draw({ center: [cx * k, (height - cy) * k], radius: rs * k, time, octaves: phone ? 2 : 3, flash, meteors: segments })
    }

    const step = (dt: number) => {
      const gravity = 3800 * rs * rs
      const trail = phone ? 7 : 10
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        const dx = cx - m.x
        const dy = cy - m.y
        const r2 = dx * dx + dy * dy
        const r = Math.sqrt(r2)
        const pull = gravity / Math.max(r2, rs * rs)
        m.vx += (dx / r) * pull * dt
        m.vy += (dy / r) * pull * dt
        const drag = 1 - 0.35 * dt
        m.vx *= drag
        m.vy *= drag
        const speed = Math.hypot(m.vx, m.vy)
        if (speed > 1800) {
          m.vx *= 1800 / speed
          m.vy *= 1800 / speed
        }
        m.x += m.vx * dt
        m.y += m.vy * dt
        m.life += dt
        m.trail.push([m.x, m.y])
        if (m.trail.length > trail) m.trail.shift()
        if (r < rs * 1.04) {
          flash = Math.min(1, flash + 0.55)
          meteors.splice(i, 1)
        } else if (m.life > HERO_SCENE.meteorLife) meteors.splice(i, 1)
      }
      flash *= Math.exp(-dt * 3)
    }

    const spawn = (x: number, y: number, pvx = 0, pvy = 0) => {
      if (!motion || meteors.length >= HERO_SCENE.meteors) return
      const dx = cx - x
      const dy = cy - y
      const d = Math.hypot(dx, dy) || 1
      // Aimed beside the hole, not at it, so the fall curves; the pointer's flick bends it further.
      const turn = (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.5)
      const c = Math.cos(turn)
      const s = Math.sin(turn)
      const speed = 240 + Math.random() * 200
      const ux = dx / d
      const uy = dy / d
      meteors.push({ x, y, vx: (ux * c - uy * s) * speed + pvx * 0.35, vy: (ux * s + uy * c) * speed + pvy * 0.35, life: 0, trail: [[x, y]] })
      start()
    }

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ema = ema * 0.95 + dt * 1000 * 0.05
      if (ema > SLOW_FRAME_MS) {
        slow += dt
        if (slow > 2 && quality > HERO_SCENE.minScale + 0.05) {
          quality = Math.max(HERO_SCENE.minScale, quality - 0.15)
          slow = 0
          ema = 16
          size()
        }
      } else slow = 0
      if (coarse) {
        idle += dt
        if (idle > HERO_SCENE.idle && meteors.length < 3) {
          idle = 0
          const a = Math.random() * Math.PI * 2
          spawn(cx + Math.cos(a) * width * 0.55, cy + Math.sin(a) * height * 0.45)
        }
      }
      step(dt)
      draw(now / 1000)
    }
    function start() {
      if (running || !motion || !visible || document.hidden) return
      running = true
      last = performance.now()
      gsap.ticker.add(tick)
    }
    const stop = () => {
      if (!running) return
      running = false
      gsap.ticker.remove(tick)
    }

    size()
    draw(14)
    const resize = new ResizeObserver(() => {
      size()
      draw(performance.now() / 1000)
    })
    resize.observe(root)
    const watch =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            if (visible) start()
            else stop()
          })
        : null
    watch?.observe(root)
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)

    let lastPoint: { x: number; y: number; t: number } | null = null
    let travelled = 0
    let lastSpawn = 0
    const onMove = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const now = performance.now()
      if (lastPoint) {
        const dt = Math.max(1, now - lastPoint.t) / 1000
        travelled += Math.hypot(x - lastPoint.x, y - lastPoint.y)
        if (travelled > 70 && now - lastSpawn > 110) {
          travelled = 0
          lastSpawn = now
          const clampV = (v: number) => Math.max(-900, Math.min(900, v))
          spawn(x, y, clampV((x - lastPoint.x) / dt), clampV((y - lastPoint.y) / dt))
        }
      }
      lastPoint = { x, y, t: now }
    }
    const onLeave = () => {
      lastPoint = null
    }
    const onDown = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect()
      spawn(event.clientX - rect.left, event.clientY - rect.top)
    }
    if (motion) {
      root.addEventListener('pointermove', onMove)
      root.addEventListener('pointerleave', onLeave)
      root.addEventListener('pointerdown', onDown)
    }
    start()

    return () => {
      stop()
      resize.disconnect()
      watch?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('pointerdown', onDown)
      renderer.dispose()
    }
  }, [scope, canvasRef, motion, onUnsupported])
}
