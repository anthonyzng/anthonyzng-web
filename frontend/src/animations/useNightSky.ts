import { useEffect, type RefObject } from 'react'
import { gsap } from './gsap'
import { BACKDROP } from './motion'
import { isPhoneBudget } from './budget'
import { onSectionArrival } from './sectionArrival'

interface Star {
  x: number
  y: number
  /** Depth, 0.2 to 1: nearer stars are brighter and drift faster. */
  z: number
}

interface ShootingStar {
  x: number
  y: number
  vx: number
  vy: number
  length: number
}

/**
 * The dark theme's sky behind every section but the hero: stars streaming slowly along a current
 * that turns over time, and a shooting star crossing left to right whenever a section arrives, each
 * section at its own angle (`BACKDROP.shootAngles`). Canvas 2D, fixed to the viewport, at most 1.5
 * device pixels per CSS pixel. It runs only while some of it shows (the hero, opaque in dark mode,
 * covers it at the top of the page) and the tab is visible. Without motion: one still frame.
 */
export function useNightSky(canvasRef: RefObject<HTMLCanvasElement | null>, motion: boolean): void {
  useEffect(() => {
    const canvas = canvasRef.current
    const g = canvas?.getContext('2d')
    if (!canvas || !g) return
    let width = 0
    let height = 0
    let scale = 1
    let stars: Star[] = []
    const shooters: ShootingStar[] = []
    let covered = false
    let running = false
    let last = 0

    const size = () => {
      const phone = isPhoneBudget()
      width = window.innerWidth
      height = window.innerHeight
      scale = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      stars = Array.from({ length: phone ? BACKDROP.starsPhone : BACKDROP.stars }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        z: 0.2 + Math.random() * 0.8,
      }))
    }

    const draw = (dt: number, t: number) => {
      g.setTransform(scale, 0, 0, scale, 0, 0)
      g.clearRect(0, 0, width, height)
      const angle = Math.PI * 0.9 + Math.sin(t * 0.05) * 0.4
      const dx = Math.cos(angle)
      const dy = Math.sin(angle)
      g.fillStyle = '#e8eef9'
      for (const s of stars) {
        const v = (6 + 24 * s.z) * dt
        s.x = (s.x + dx * v + width) % width
        s.y = (s.y + dy * v + height) % height
        g.globalAlpha = 0.22 + 0.6 * s.z * (0.7 + 0.3 * Math.sin(t * 2 + s.x))
        const d = s.z > 0.85 ? 2 : 1.2
        g.fillRect(s.x, s.y, d, d)
      }
      g.globalAlpha = 1
      g.globalCompositeOperation = 'lighter'
      g.lineCap = 'round'
      for (let i = shooters.length - 1; i >= 0; i--) {
        const s = shooters[i]
        s.x += s.vx * dt
        s.y += s.vy * dt
        if (s.x - s.length > width + 40) {
          shooters.splice(i, 1)
          continue
        }
        const speed = Math.hypot(s.vx, s.vy)
        const tx = s.x - (s.vx / speed) * s.length
        const ty = s.y - (s.vy / speed) * s.length
        const life = Math.min(1, Math.max(0, s.x / (width * 0.15))) * Math.min(1, Math.max(0, (width + 40 - s.x) / (width * 0.2)))
        const tail = g.createLinearGradient(s.x, s.y, tx, ty)
        tail.addColorStop(0, `rgba(230,240,255,${(0.9 * life).toFixed(3)})`)
        tail.addColorStop(0.3, `rgba(150,190,255,${(0.35 * life).toFixed(3)})`)
        tail.addColorStop(1, 'rgba(120,160,255,0)')
        g.strokeStyle = tail
        g.lineWidth = 2.2
        g.beginPath()
        g.moveTo(s.x, s.y)
        g.lineTo(tx, ty)
        g.stroke()
        const head = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, 10)
        head.addColorStop(0, `rgba(255,255,255,${life.toFixed(3)})`)
        head.addColorStop(1, 'rgba(160,200,255,0)')
        g.fillStyle = head
        g.beginPath()
        g.arc(s.x, s.y, 10, 0, Math.PI * 2)
        g.fill()
      }
      g.globalCompositeOperation = 'source-over'
    }

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      draw(dt, now / 1000)
    }
    const update = () => {
      const want = motion && !covered && !document.hidden
      if (want && !running) {
        running = true
        last = performance.now()
        gsap.ticker.add(tick)
      } else if (!want && running) {
        running = false
        gsap.ticker.remove(tick)
      }
    }

    size()
    draw(0, 0)
    const onResize = () => {
      size()
      draw(0, performance.now() / 1000)
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', update)

    // The hero is opaque in dark mode: while it fills the screen there is no sky to draw.
    const hero = document.querySelector('[data-hero]')
    const heroWatch =
      hero && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            ([entry]) => {
              covered = entry.isIntersecting && entry.intersectionRect.height >= window.innerHeight * 0.98
              update()
            },
            { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
          )
        : null
    if (hero) heroWatch?.observe(hero)

    const stopArrivals = onSectionArrival((index) => {
      if (!motion || index <= 0) return
      const angles = BACKDROP.shootAngles
      const a = (angles[(index - 1) % angles.length] * Math.PI) / 180
      const speed = isPhoneBudget() ? 700 : 1000
      const rise = Math.tan(a) * width
      const lo = 0.08 * height
      const hi = 0.92 * height
      // Starts high when it falls and low when it climbs, so the whole crossing stays on screen.
      const y = rise >= 0 ? lo + Math.random() * Math.max(0, hi - rise - lo) : Math.min(hi, lo - rise) + Math.random() * Math.max(0, hi - Math.min(hi, lo - rise))
      shooters.push({ x: -40, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, length: isPhoneBudget() ? 120 : 200 })
    })
    update()

    return () => {
      if (running) gsap.ticker.remove(tick)
      running = false
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', update)
      heroWatch?.disconnect()
      stopArrivals()
    }
  }, [canvasRef, motion])
}
