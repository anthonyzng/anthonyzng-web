import { useEffect, useRef, type RefObject } from 'react'
import { isPhoneBudget } from './budget'
import { gsap } from './gsap'
import { CANVAS_BUDGET, CONTACT_SCENE } from './motion'
import { canvasScale } from './resolution'

export type Rgb = readonly [number, number, number]

export interface MeteorChannel {
  label: string
  rgb: Rgb
}

type Mode = 'wander' | 'approach' | 'hold' | 'leave'

interface Meteor {
  index: number
  x: number
  y: number
  vx: number
  vy: number
  heading: number
  phase: number
  freq: number
  mode: Mode
  modeTime: number
  size: number
  fromSize: number
  side: -1 | 1
  targetX: number
  startDistance: number
  trail: number[]
}

interface TitleBox {
  left: number
  right: number
  cy: number
  half: number
}

const ease = (x: number) => x * x * (3 - 2 * x)
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/**
 * The dark contact screen: each channel is a meteor of its own colour (`channels`) drifting slowly
 * through the sky (slow enough to click; it stops while pointed at), growing and shrinking, and
 * kept apart from the others. In turn one swings in beside the title, sides alternating, and is at
 * its largest exactly on the title's line; meanwhile the title takes on its colour, and is its link
 * (`onAlign` reports the channel, or null). Clicking a meteor activates its channel (`onActivate`).
 * Canvas 2D at up to 1.5 device pixels, within the contact pixel budget (`canvasScale`); runs only
 * while the section is on screen. Without motion:
 * the meteors rest beside the title, two on each side, and nothing moves.
 */
export function useMeteorContact(
  scope: RefObject<HTMLElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  titleRef: RefObject<HTMLElement | null>,
  channels: readonly MeteorChannel[],
  motion: boolean,
  onAlign: (index: number | null) => void,
  onActivate: (index: number) => void,
): void {
  // The callbacks may change identity every render; the scene reads the latest.
  const handlers = useRef({ onAlign, onActivate })
  useEffect(() => {
    handlers.current = { onAlign, onActivate }
  })
  const looks = channels.map((c) => `${c.label}:${c.rgb.join(',')}`).join('|')

  useEffect(() => {
    const root = scope.current
    const canvas = canvasRef.current
    const title = titleRef.current
    const g = canvas?.getContext('2d')
    if (!root || !canvas || !title || !g || channels.length === 0) return
    // The theme's text colour from its token (the body's computed colour may still be mid-transition).
    const hex = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim().replace('#', '')
    const fg: Rgb = /^[0-9a-f]{6}$/i.test(hex) ? [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)] : [238, 242, 248]
    let width = 0
    let height = 0
    let k = 1
    let box: TitleBox = { left: 0, right: 0, cy: 0, half: 0 }
    let meteors: Meteor[] = []
    let next = 1.5
    let turn = 0
    let sideCount = 0
    let hover: Meteor | null = null
    let aligned: number | null = null
    let visible = false
    let running = false
    let last = 0

    const phone = () => isPhoneBudget() || width < 600
    const measure = () => {
      const rect = root.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(title)
      const text = range.getBoundingClientRect()
      box = { left: text.left - rect.left, right: text.right - rect.left, cy: text.top - rect.top + text.height / 2, half: text.height / 2 }
    }
    const place = () => {
      // One meteor per corner of the sky round the title, in random order, heading off at random.
      const zones = [
        [0.08, 0.32, 0.12, 0.3],
        [0.68, 0.92, 0.12, 0.3],
        [0.08, 0.32, 0.6, 0.76],
        [0.68, 0.92, 0.6, 0.76],
      ].sort(() => Math.random() - 0.5)
      meteors = channels.map((_, index) => {
        const [x0, x1, y0, y1] = zones[index % zones.length]
        const a = Math.random() * Math.PI * 2
        return {
          index,
          x: width * (x0 + Math.random() * (x1 - x0)),
          y: height * (y0 + Math.random() * (y1 - y0)),
          vx: Math.cos(a) * 14,
          vy: Math.sin(a) * 14,
          heading: a,
          phase: Math.random() * 6.28,
          freq: 0.6 + Math.random() * 0.6,
          mode: 'wander',
          modeTime: 0,
          size: 5,
          fromSize: 5,
          side: 1,
          targetX: 0,
          startDistance: 1,
          trail: [],
        }
      })
    }
    const size = () => {
      const oldW = width
      const oldH = height
      width = root.clientWidth
      height = root.clientHeight
      k = canvasScale(width, height, 1.5, CANVAS_BUDGET.contact)
      canvas.width = Math.max(1, Math.round(width * k))
      canvas.height = Math.max(1, Math.round(height * k))
      measure()
      if (!width || !height) return
      if (meteors.length === 0 || !oldW || !oldH) place()
      else
        for (const m of meteors) {
          m.x *= width / oldW
          m.y *= height / oldH
          m.trail = []
        }
    }
    const targetFor = (m: Meteor) => {
      const small = phone()
      const maxR = small ? 13 : 22
      const gap = small ? 14 : 36
      const leftRoom = box.left - gap - maxR
      const rightRoom = width - (box.right + gap + maxR)
      return m.side < 0
        ? Math.max(maxR + 8, leftRoom - Math.random() * Math.max(0, leftRoom - (small ? maxR + 8 : 120)))
        : Math.min(width - maxR - 8, box.right + gap + maxR + Math.random() * Math.max(0, rightRoom - (small ? maxR + 8 : 120)))
    }

    const draw = () => {
      const small = phone()
      const maxR = small ? 13 : 22
      g.setTransform(k, 0, 0, k, 0, 0)
      g.clearRect(0, 0, width, height)
      g.globalCompositeOperation = 'lighter'
      g.lineCap = 'round'
      for (const m of meteors) {
        const [r, gg, b] = channels[m.index].rgb
        const n = m.trail.length / 2
        for (let i = 1; i < n; i++) {
          const p = i / n
          g.strokeStyle = `rgba(${r},${gg},${b},${(p * p * 0.8).toFixed(3)})`
          g.lineWidth = Math.max(0.6, m.size * 0.9 * p)
          g.beginPath()
          g.moveTo(m.trail[i * 2 - 2], m.trail[i * 2 - 1])
          g.lineTo(m.trail[i * 2], m.trail[i * 2 + 1])
          g.stroke()
        }
        const R = m.size * 3
        const glow = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, R)
        glow.addColorStop(0, 'rgba(255,255,255,1)')
        glow.addColorStop(0.22, `rgba(${r},${gg},${b},.95)`)
        glow.addColorStop(0.5, `rgba(${r},${gg},${b},.25)`)
        glow.addColorStop(1, `rgba(${r},${gg},${b},0)`)
        g.fillStyle = glow
        g.beginPath()
        g.arc(m.x, m.y, R, 0, Math.PI * 2)
        g.fill()
      }
      g.globalCompositeOperation = 'source-over'
      for (const m of meteors) {
        const grow = clamp((m.size - 5) / (maxR - 5), 0, 1)
        const fs = (small ? 11 : 12) + grow * (small ? 3 : 8)
        g.font = `500 ${fs}px "IBM Plex Mono", ui-monospace, monospace`
        g.fillStyle = `rgba(${channels[m.index].rgb.join(',')},${(0.78 + 0.22 * grow).toFixed(3)})`
        g.textBaseline = 'middle'
        const label = channels[m.index].label
        const beside = m.mode === 'hold' || (m.mode === 'approach' && grow > 0.5) || !motion
        if (small && beside) {
          g.textAlign = 'center'
          g.fillText(label, m.x, m.y + m.size * 1.9 + 8)
        } else if (beside && m.side < 0) {
          g.textAlign = 'right'
          g.fillText(label, m.x - m.size * 1.6 - 8, m.y)
        } else {
          g.textAlign = 'left'
          g.fillText(label, m.x + m.size * 1.6 + 8, m.y)
        }
      }
    }

    const step = (dt: number, t: number) => {
      const small = phone()
      const base = small ? 4 : 5.5
      const maxR = small ? 13 : 22
      const vmax = small ? CONTACT_SCENE.driftPhone : CONTACT_SCENE.drift
      next -= dt
      if (next <= 0) {
        const m = meteors[turn % meteors.length]
        turn++
        if (m.mode === 'wander') {
          m.side = sideCount++ % 2 ? 1 : -1
          m.mode = 'approach'
          m.modeTime = 0
          m.targetX = targetFor(m)
          m.startDistance = Math.hypot(m.targetX - m.x, box.cy - m.y) || 1
          m.fromSize = m.size
        }
        next = CONTACT_SCENE.every
      }
      // Keep the meteors apart: drifting ones give way to each other and to the one at the title.
      const minD = small ? CONTACT_SCENE.spacingPhone : CONTACT_SCENE.spacing
      for (let i = 0; i < meteors.length; i++)
        for (let j = i + 1; j < meteors.length; j++) {
          const a = meteors[i]
          const c = meteors[j]
          const dx = c.x - a.x
          const dy = c.y - a.y
          const d = Math.hypot(dx, dy) || 0.01
          if (d >= minD) continue
          const nx = dx / d
          const ny = dy / d
          const fixedA = a.mode === 'approach' || a.mode === 'hold'
          const fixedC = c.mode === 'approach' || c.mode === 'hold'
          const push = (minD - d) * 3 * dt * (fixedA || fixedC ? 2 : 1)
          const nudge = Math.max(0, minD * 0.6 - d) * 0.5
          if (!fixedA) {
            a.vx -= nx * push
            a.vy -= ny * push
            a.x -= nx * nudge
            a.y -= ny * nudge
          }
          if (!fixedC) {
            c.vx += nx * push
            c.vy += ny * push
            c.x += nx * nudge
            c.y += ny * nudge
          }
        }
      let tint = 0
      let tintIndex: number | null = null
      const take = (f: number, m: Meteor) => {
        if (f > tint) {
          tint = f
          tintIndex = m.index
        }
      }
      for (const m of meteors) {
        m.modeTime += dt
        const wanderSize = base * (1 + 0.5 * Math.sin(t * m.freq + m.phase))
        if (m === hover) {
          m.vx *= 1 - Math.min(1, 4 * dt)
          m.vy *= 1 - Math.min(1, 4 * dt)
          if (m.mode === 'hold') take(1, m)
        } else if (m.mode === 'wander' || m.mode === 'leave') {
          m.heading += (Math.random() - 0.5) * 3 * dt
          let fx = Math.cos(m.heading) * 10
          let fy = Math.sin(m.heading) * 10
          const pad = 50
          if (m.x < pad) fx += 30
          if (m.x > width - pad) fx -= 30
          if (m.y < pad + 40) fy += 30
          if (m.y > height - pad - 110) fy -= 36
          if (m.x > box.left - 20 && m.x < box.right + 20 && Math.abs(m.y - box.cy) < box.half + 30) fy += (m.y < box.cy ? -1 : 1) * 60
          if (m.mode === 'leave') {
            const p = Math.min(1, m.modeTime / 2)
            m.size = m.fromSize + (wanderSize - m.fromSize) * ease(p)
            take(1 - ease(Math.min(1, m.modeTime / 1.2)), m)
            fy += (m.y < box.cy ? -1 : 1) * 18
            if (p >= 1) m.mode = 'wander'
          } else m.size = wanderSize
          m.vx += fx * dt
          m.vy += fy * dt
          const sp = Math.hypot(m.vx, m.vy)
          if (sp > vmax) {
            m.vx *= vmax / sp
            m.vy *= vmax / sp
          }
        } else {
          // A slow, critically damped spring onto the title's line.
          const spring = m.mode === 'hold' ? 12 : 0.75
          const damp = 2 * Math.sqrt(spring)
          m.vx += ((m.targetX - m.x) * spring - m.vx * damp) * dt
          m.vy += ((box.cy - m.y) * spring - m.vy * damp) * dt
          const d = Math.hypot(m.targetX - m.x, box.cy - m.y)
          if (m.mode === 'approach') {
            const p = 1 - Math.min(1, d / m.startDistance)
            m.size = m.fromSize + (maxR - m.fromSize) * ease(p)
            take(ease(clamp((p - 0.6) / 0.4, 0, 1)), m)
            if (d < 1.5 || m.modeTime > 7) {
              m.mode = 'hold'
              m.modeTime = 0
              m.size = maxR
            }
          } else {
            m.size = maxR
            take(1, m)
            if (m.modeTime > CONTACT_SCENE.rest) {
              m.mode = 'leave'
              m.modeTime = 0
              m.fromSize = maxR
              m.heading = m.side < 0 ? Math.PI : 0
              m.vx = m.side * 10
              m.vy = 0
            }
          }
        }
        m.x += m.vx * dt
        m.y += m.vy * dt
        const lx = m.trail[m.trail.length - 2]
        const ly = m.trail[m.trail.length - 1]
        if (lx === undefined || Math.hypot(m.x - lx, m.y - ly) > 1.2) {
          m.trail.push(m.x, m.y)
          if (m.trail.length > (small ? 22 : 30) * 2) m.trail.splice(0, 2)
        }
      }
      // The title takes on the colour of the meteor at its side, and becomes its link.
      const rgb = tintIndex === null ? fg : channels[tintIndex].rgb
      title.style.color = `rgb(${fg.map((v, i) => Math.round(v + (rgb[i] - v) * tint)).join(' ')})`
      const now = tint > 0.6 ? tintIndex : null
      if (now !== aligned) {
        aligned = now
        handlers.current.onAlign(now)
      }
    }

    const still = () => {
      const small = phone()
      const maxR = small ? 13 : 22
      meteors.forEach((m, i) => {
        m.side = i % 4 < 2 ? -1 : 1
        m.x = targetFor(m)
        m.y = box.cy + (i % 2 ? 1 : -1) * (small ? 34 : 54) + Math.floor(i / 4) * 40
        m.size = maxR * 0.6
        m.trail = []
      })
      draw()
    }

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      step(dt, now / 1000)
      draw()
    }
    const start = () => {
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
    if (motion) draw()
    else still()
    const resize = new ResizeObserver(() => {
      size()
      if (motion) draw()
      else still()
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

    const meteorAt = (event: PointerEvent | MouseEvent) => {
      const rect = root.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      return meteors.find((m) => Math.hypot(m.x - x, m.y - y) < m.size * 2 + 22) ?? null
    }
    const onMove = (event: PointerEvent) => {
      hover = meteorAt(event)
      canvas.style.cursor = hover ? 'pointer' : ''
    }
    const onLeave = () => {
      hover = null
      canvas.style.cursor = ''
    }
    const onClick = (event: MouseEvent) => {
      const m = meteorAt(event)
      if (m) handlers.current.onActivate(m.index)
    }
    // The canvas takes the pointer (meteors are clickable); the screen's links and title sit above it.
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('click', onClick)
    start()

    return () => {
      stop()
      resize.disconnect()
      watch?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('click', onClick)
      title.style.color = ''
      if (aligned !== null) handlers.current.onAlign(null)
    }
    // `looks` stands for `channels` (a new array every render, the same meteors).
  }, [scope, canvasRef, titleRef, looks, motion]) // eslint-disable-line react-hooks/exhaustive-deps
}
