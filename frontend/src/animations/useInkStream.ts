import { useEffect, type RefObject } from 'react'
import { isPhoneBudget } from './budget'
import { gsap } from './gsap'
import { clamp, drawSpriteLeaf, easeOut, inkRgba, leafSprite, makePath, mountains, pathAt, pathAtY, rand, rock, type PathPoint } from './inkPainting'
import { CANVAS_BUDGET, HERO_SCENE } from './motion'
import { canvasScale } from './resolution'

interface Flow {
  s: number
  offset: number
  speed: number
  length: number
  /** A crescent ripple across the current, or a long streak along it. */
  ripple: boolean
}

interface Leaf {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  spin: number
  phase: number
  size: number
  floating: boolean
  s: number
  offset: number
  life: number
}

interface Ripple {
  x: number
  y: number
  age: number
}

const newFlow = (anywhere: boolean): Flow => ({
  s: anywhere ? Math.random() : rand(0, 0.08),
  offset: rand(-0.6, 0.6),
  speed: rand(0.03, 0.055),
  length: rand(0.01, 0.024),
  ripple: Math.random() < 0.75,
})

/**
 * The light hero, painted in ink on the page's paper (the hero itself is see-through, and the bamboo
 * is the page grove's): hills in mist and a stream winding down between dry-brush banks and rocks,
 * painted once (`staticRef`), and over it (`liveRef`) the water in the painters' way, crescent ripples
 * and streaks carried downstream, and bamboo leaves: moving the pointer over the hero (or touching
 * it) lets a leaf fall from that point; it flutters towards the stream, lands with a ripple and is
 * carried away. At most `HERO_SCENE.leaves` at once; phones without a hover pointer get one now and
 * then on their own. Runs only while the hero is on screen; without motion the water is drawn
 * still and no leaf falls.
 */
export function useInkStream(
  scope: RefObject<HTMLElement | null>,
  staticRef: RefObject<HTMLCanvasElement | null>,
  liveRef: RefObject<HTMLCanvasElement | null>,
  motion: boolean,
): void {
  useEffect(() => {
    const root = scope.current
    const paper = staticRef.current
    const water = liveRef.current
    const pg = paper?.getContext('2d')
    const g = water?.getContext('2d')
    if (!root || !paper || !water || !pg || !g) return
    const sprite = leafSprite()
    const phone = isPhoneBudget()
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
    let width = 0
    let height = 0
    let k = 1
    let path: PathPoint[] = []
    let flows: Flow[] = []
    const leaves: Leaf[] = []
    const ripples: Ripple[] = []
    let visible = true
    let running = false
    let last = 0
    let idle = 0

    const paint = () => {
      pg.setTransform(k, 0, 0, k, 0, 0)
      pg.clearRect(0, 0, width, height)
      const W = width
      const H = height
      mountains(pg, 0, W, H * 0.31, H * 0.13, 0.09, H * 0.2, 11, 1)
      mountains(pg, W * 0.3, W, H * 0.36, H * 0.1, 0.15, H * 0.16, 23, 1.6)
      mountains(pg, 0, W * 0.55, H * 0.42, H * 0.07, 0.12, H * 0.12, 37, 2.2)
      const mist = pg.createLinearGradient(0, H * 0.33, 0, H * 0.5)
      mist.addColorStop(0, 'rgba(248,246,240,0)')
      mist.addColorStop(0.6, 'rgba(248,246,240,.85)')
      mist.addColorStop(1, 'rgba(248,246,240,0)')
      pg.fillStyle = mist
      pg.fillRect(0, H * 0.33, W, H * 0.17)
      // The water: a pale wash between the banks.
      const n = path.length
      pg.beginPath()
      path.forEach((p, i) => {
        const x = p.x + (p.nx * p.w) / 2
        const y = p.y + (p.ny * p.w) / 2
        if (i) pg.lineTo(x, y)
        else pg.moveTo(x, y)
      })
      for (let i = n - 1; i >= 0; i--) pg.lineTo(path[i].x - (path[i].nx * path[i].w) / 2, path[i].y - (path[i].ny * path[i].w) / 2)
      pg.closePath()
      pg.fillStyle = 'rgba(70,95,110,.09)'
      pg.fill()
      pg.lineCap = 'round'
      for (const side of [-1, 1]) {
        // Dry brush: the bank line breaks now and then and thickens downstream.
        for (let i = 0; i < n - 1; i++) {
          if (Math.random() < 0.3) continue
          const p = path[i]
          const q = path[i + 1]
          const depth = i / n
          const j = rand(-1.5, 1.5) * (1 + depth * 3)
          pg.strokeStyle = inkRgba(rand(0.15, 0.4) * (0.5 + depth))
          pg.lineWidth = rand(0.4, 1.1) + depth * rand(0.3, 1.8)
          pg.beginPath()
          pg.moveTo(p.x + side * p.nx * (p.w / 2 + j), p.y + side * p.ny * (p.w / 2 + j))
          pg.lineTo(q.x + side * q.nx * (q.w / 2 + j), q.y + side * q.ny * (q.w / 2 + j))
          pg.stroke()
        }
        // A faint wash of ground along the bank, one continuous stroke (segments would bead).
        pg.strokeStyle = inkRgba(0.04)
        pg.lineWidth = Math.max(18, path[n - 1].w * 0.35)
        pg.lineJoin = 'round'
        pg.beginPath()
        path.forEach((p, i) => {
          const o = p.w / 2 + 10 + (i / n) * 22
          if (i) pg.lineTo(p.x + side * p.nx * o, p.y + side * p.ny * o)
          else pg.moveTo(p.x + side * p.nx * o, p.y + side * p.ny * o)
        })
        pg.stroke()
      }
      for (let i = 0; i < (phone ? 3 : 6); i++) {
        const s = 0.5 + i * 0.08
        const p = pathAt(path, s)
        const side = i % 2 ? 1 : -1
        const size = 6 + s * (phone ? 12 : 20)
        rock(pg, p.x + side * p.nx * (p.w / 2 + size * 1.1), p.y + side * p.ny * (p.w / 2 + size * 1.1), size, 0.28 + s * 0.3)
      }
    }

    const size = () => {
      width = root.clientWidth
      height = root.clientHeight
      k = canvasScale(width, height, 1.5, CANVAS_BUDGET.scene)
      for (const c of [paper, water]) {
        c.width = Math.max(1, Math.round(width * k))
        c.height = Math.max(1, Math.round(height * k))
      }
      const m = Math.max(Math.min(width, height), width * 0.55)
      path = makePath(
        ([[0.6, 0.25], [0.55, 0.37], [0.61, 0.49], [0.52, 0.62], [0.43, 0.76], [0.35, 0.9], [0.28, 1.08]] as [number, number][]).map(([x, y]) => [x * width, y * height]),
        [0.01, 0.025, 0.045, 0.07, 0.1, 0.13, 0.17].map((v) => v * m),
      )
      flows = Array.from({ length: phone ? HERO_SCENE.flowsPhone : HERO_SCENE.flows }, () => newFlow(true))
      paint()
    }

    const draw = (dt: number, t: number) => {
      g.setTransform(k, 0, 0, k, 0, 0)
      g.clearRect(0, 0, width, height)
      g.lineCap = 'round'
      for (const f of flows) {
        f.s += f.speed * dt * (0.6 + f.s * 0.9)
        if (f.s > 1) Object.assign(f, newFlow(false))
        const fade = Math.min(1, f.s * 8) * Math.min(1, (1 - f.s) * 6)
        g.strokeStyle = `rgba(40,48,52,${(0.34 * fade * (0.4 + f.s)).toFixed(3)})`
        g.lineWidth = 0.6 + f.s * 1.2
        g.beginPath()
        if (f.ripple) {
          const c = pathAt(path, f.s)
          const x = c.x + (c.nx * f.offset * c.w) / 2
          const y = c.y + (c.ny * f.offset * c.w) / 2
          const half = c.w * (0.12 + f.length * 4)
          const bulge = c.w * 0.1
          g.moveTo(x - c.nx * half, y - c.ny * half)
          g.quadraticCurveTo(x + c.tx * bulge, y + c.ty * bulge, x + c.nx * half, y + c.ny * half)
        } else {
          const a = pathAt(path, f.s)
          const b = pathAt(path, f.s + f.length)
          const mid = pathAt(path, f.s + f.length / 2)
          g.moveTo(a.x + (a.nx * f.offset * a.w) / 2, a.y + (a.ny * f.offset * a.w) / 2)
          g.quadraticCurveTo(mid.x + mid.nx * ((f.offset * mid.w) / 2 + 2), mid.y + mid.ny * ((f.offset * mid.w) / 2 + 2), b.x + (b.nx * f.offset * b.w) / 2, b.y + (b.ny * f.offset * b.w) / 2)
        }
        g.stroke()
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]
        r.age += dt / 1.6
        if (r.age >= 1) {
          ripples.splice(i, 1)
          continue
        }
        const R = 4 + 26 * easeOut(r.age)
        g.strokeStyle = inkRgba(0.35 * (1 - r.age))
        g.lineWidth = 1
        g.beginPath()
        g.ellipse(r.x, r.y, R, R * 0.32, 0, 0, Math.PI * 2)
        g.stroke()
      }
      if (!sprite) return
      for (let i = leaves.length - 1; i >= 0; i--) {
        const leaf = leaves[i]
        leaf.life += dt
        if (!leaf.floating) {
          // Flutters down, drawn towards the stream below it.
          leaf.vy = Math.min(leaf.vy + 40 * dt, 55)
          const under = pathAtY(path, leaf.y) ?? path[0]
          leaf.vx += (under.x - leaf.x) * 0.55 * dt
          leaf.vx *= 1 - 0.6 * dt
          leaf.x += (leaf.vx + Math.sin(t * 1.8 + leaf.phase) * 26) * dt
          leaf.y += leaf.vy * dt
          leaf.rot += (leaf.spin + Math.cos(t * 1.8 + leaf.phase) * 1.1) * dt
          const at = pathAtY(path, leaf.y)
          if (at) {
            const off = (leaf.x - at.x) * at.nx + (leaf.y - at.y) * at.ny
            if (Math.abs(off) < at.w / 2) {
              leaf.floating = true
              leaf.s = at.s
              leaf.offset = clamp(off / (at.w / 2), -0.8, 0.8)
              ripples.push({ x: leaf.x, y: leaf.y, age: 0 })
            }
          }
          if (leaf.y > height + 30 || leaf.life > 30) {
            leaves.splice(i, 1)
            continue
          }
          drawSpriteLeaf(g, sprite, leaf.x, leaf.y, leaf.rot, leaf.size, 0.9, 0.55 + 0.45 * Math.abs(Math.sin(t * 1.8 + leaf.phase)))
        } else {
          // Carried downstream, faster where the stream widens.
          leaf.s += (0.03 + 0.05 * leaf.s) * dt
          leaf.rot += 0.25 * dt
          if (leaf.s >= 0.995) {
            leaves.splice(i, 1)
            continue
          }
          const p = pathAt(path, leaf.s)
          leaf.x = p.x + (p.nx * leaf.offset * p.w) / 2
          leaf.y = p.y + (p.ny * leaf.offset * p.w) / 2
          drawSpriteLeaf(g, sprite, leaf.x, leaf.y, leaf.rot, leaf.size * (0.9 + leaf.s * 0.4), 0.85, 0.5)
        }
      }
    }

    const spawn = (x: number, y: number, pvx = 0) => {
      if (!motion || leaves.length >= HERO_SCENE.leaves) return
      leaves.push({ x, y, vx: pvx * 0.15 + rand(-15, 15), vy: rand(10, 25), rot: rand(0, Math.PI * 2), spin: rand(-1.4, 1.4), phase: rand(0, 6.28), size: rand(0.75, 1.15), floating: false, s: 0, offset: 0, life: 0 })
      start()
    }

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (coarse) {
        idle += dt
        if (idle > HERO_SCENE.idle && leaves.length < 2) {
          idle = 0
          spawn(rand(0.1, 0.9) * width, rand(0, 0.25) * height)
        }
      }
      draw(dt, now / 1000)
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
    draw(0, 0)
    let resizeTimer = 0
    const resize = new ResizeObserver(() => {
      // Repainting the hills is not free: once the size settles.
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        size()
        draw(0, performance.now() / 1000)
      }, 120)
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
        travelled += Math.hypot(x - lastPoint.x, y - lastPoint.y)
        if (travelled > 70 && now - lastSpawn > 220) {
          travelled = 0
          lastSpawn = now
          spawn(x, y, Math.max(-900, Math.min(900, (x - lastPoint.x) / (Math.max(1, now - lastPoint.t) / 1000))))
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
      window.clearTimeout(resizeTimer)
      resize.disconnect()
      watch?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('pointerdown', onDown)
    }
  }, [scope, staticRef, liveRef, motion])
}
