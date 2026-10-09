import { useEffect, useRef, type RefObject } from 'react'
import { isPhoneBudget } from './budget'
import { gsap } from './gsap'
import { clamp, easeOut, smooth } from './inkPainting'
import { CONTACT_SCENE } from './motion'

export interface InkChannel {
  /** What the drop writes: the channel's name. */
  label: string
}

export interface InkWritingControls {
  /** Drip the channel's ink now (an icon pointed at or focused). */
  drop(index: number): void
  /** The written word is pointed at or focused: the paper dampens round it and it waits. */
  setHover(hover: boolean): void
}

type Phase = 'wait' | 'fall' | 'splash' | 'write' | 'hold' | 'fade'

interface Blot {
  r: number[]
  halo: number[]
  stain: number[]
  spikes: { a: number; len: number; w: number }[]
  drops: { a: number; d: number; s: number }[]
  tendrils: { u: number; v: number; bend: number }[]
}

/** Two layers of noise on a circle: a wobbly outline, fixed per drop. */
function wobble(n: number, amp1: number, amp2: number): number[] {
  const p1 = Math.random() * 6.28
  const p2 = Math.random() * 6.28
  const f1 = 3 + Math.floor(Math.random() * 3)
  const f2 = 9 + Math.floor(Math.random() * 5)
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return 1 + amp1 * Math.sin(a * f1 + p1) + amp2 * Math.sin(a * f2 + p2) + (Math.random() - 0.5) * 0.08
  })
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

function blotPath(g: CanvasRenderingContext2D, cx: number, cy: number, radii: number[], R: number, squash: number): void {
  const n = radii.length
  const points = radii.map((k, i) => {
    const a = (i / n) * Math.PI * 2
    return [cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k * squash] as const
  })
  g.beginPath()
  g.moveTo((points[0][0] + points[n - 1][0]) / 2, (points[0][1] + points[n - 1][1]) / 2)
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const q = points[(i + 1) % n]
    g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
  }
  g.closePath()
}

/**
 * The light contact screen: ink on the page's own paper (the backdrop's grain and bamboo show through,
 * so the screen is one with the sections above it). On `inkRef`, in turn, a drop
 * falls from a channel's icon (the `[data-brush]` elements inside `brushesRef`, in channel order),
 * lands below the title with a crown of streaks and flung droplets, soaks out through the fibres,
 * and runs along thin tendrils into the channel's name, written in a brush hand; the word stays a
 * few seconds (longer while pointed at, when the paper round it looks damp) and fades. Pointing at
 * an icon drips its channel at once (`drop`). The word's link (`wordRef`) is placed over it and
 * reported through `onWritten`; `onDrop` names the channel of the latest drop (the title's link).
 * Black ink only. Canvas 2D; runs only while the section is on
 * screen. Without motion the word is written at once, no drop and no fading.
 */
export function useInkWriting(
  scope: RefObject<HTMLElement | null>,
  inkRef: RefObject<HTMLCanvasElement | null>,
  brushesRef: RefObject<HTMLElement | null>,
  wordRef: RefObject<HTMLElement | null>,
  channels: readonly InkChannel[],
  motion: boolean,
  onWritten: (index: number | null) => void,
  onDrop: (index: number | null) => void,
): RefObject<InkWritingControls> {
  const controls = useRef<InkWritingControls>({ drop: () => {}, setHover: () => {} })
  const report = useRef(onWritten)
  const reportDrop = useRef(onDrop)
  useEffect(() => {
    report.current = onWritten
    reportDrop.current = onDrop
  })
  const labels = channels.map((c) => c.label).join('|')

  useEffect(() => {
    const root = scope.current
    const ink = inkRef.current
    const brushes = brushesRef.current
    const g = ink?.getContext('2d')
    if (!root || !ink || !brushes || !g || channels.length === 0) return
    const brushFont = getComputedStyle(root).getPropertyValue('--font-brush').trim() || 'serif'
    let width = 0
    let height = 0
    let k = 1
    // How far the written word keeps from the screen's sides.
    let side = 16
    let idx = channels.length - 1
    let phase: Phase = 'wait'
    let t = 0
    let x = 0
    let y = 0
    let vy = 0
    let landY = 0
    let blot: Blot | null = null
    let hover = false
    let disposed = false
    let wet = 0
    let dirty = true
    let visible = false
    let running = false
    let last = 0

    const brushAt = (i: number) => brushes.querySelectorAll<HTMLElement>('[data-brush]')[i] ?? null
    const titleBottom = () => {
      const title = root.querySelector('h2')
      const rect = root.getBoundingClientRect()
      return title ? title.getBoundingClientRect().bottom - rect.top : height * 0.5
    }

    const size = () => {
      width = root.clientWidth
      height = root.clientHeight
      k = Math.min(window.devicePixelRatio || 1, isPhoneBudget() ? 1.5 : 2)
      ink.width = Math.max(1, Math.round(width * k))
      ink.height = Math.max(1, Math.round(height * k))
      side = Math.max(16, width * (width < 600 ? 0.05 : 0.09))
      dirty = true
    }

    const metrics = () => {
      const fs = clamp(width * 0.06, 34, 70)
      g.font = `${fs}px ${brushFont}`
      const tw = g.measureText(channels[idx].label).width
      return { fs, tw, cx: clamp(x, side + tw / 2 + 24, width - side - tw / 2 - 24) }
    }
    const placeWord = (show: boolean) => {
      const word = wordRef.current
      if (!word) return
      if (show) {
        const { fs, tw, cx } = metrics()
        Object.assign(word.style, { left: `${cx - tw / 2 - 14}px`, top: `${landY - fs * 0.8}px`, width: `${tw + 28}px`, height: `${fs * 1.6}px` })
      }
      report.current(show ? idx : null)
    }

    const drop = (i: number) => {
      idx = i
      reportDrop.current(i)
      hover = false
      wet = 0
      placeWord(false)
      const brush = brushAt(i)
      const rect = root.getBoundingClientRect()
      const b = brush?.getBoundingClientRect()
      x = b ? b.left - rect.left + b.width / 2 : width / 2
      landY = titleBottom() + clamp(height * 0.09, 46, 96)
      blot = {
        r: wobble(48, 0.1, 0.05),
        halo: wobble(48, 0.14, 0.07),
        stain: wobble(40, 0.08, 0.05),
        spikes: Array.from({ length: 13 }, () => ({ a: rand(0, 6.28), len: rand(0.5, 1.5), w: rand(0.12, 0.3) })),
        drops: Array.from({ length: 11 }, () => ({ a: rand(0, 6.28), d: rand(1.5, 3.1), s: rand(0.8, 3.2) })),
        tendrils: Array.from({ length: 7 }, () => ({ u: rand(0.05, 0.95), v: rand(-0.3, 0.3), bend: rand(-30, 30) })),
      }
      if (!motion) {
        phase = 'hold'
        t = 0
        render()
        placeWord(true)
        return
      }
      if (brush) {
        brush.classList.remove('drip')
        void brush.offsetWidth
        brush.classList.add('drip')
      }
      y = b ? b.bottom - rect.top - 2 : 0
      vy = 0
      phase = 'fall'
      t = 0
      dirty = true
      start()
    }

    const render = (): void => {
      g.setTransform(k, 0, 0, k, 0, 0)
      g.clearRect(0, 0, width, height)
      dirty = false
      if (phase === 'wait') return
      const R = width < 600 ? 24 : 34
      const sq = 0.66
      const inkA = (a: number) => `rgba(14,14,12,${Math.max(0, a).toFixed(3)})`
      if (phase === 'fall') {
        // The drop, stretched by its speed, with a glint.
        const r = width < 600 ? 4.5 : 5.5
        const stretch = 2.2 + Math.min(1.6, vy / 500)
        g.fillStyle = inkA(0.95)
        g.beginPath()
        g.moveTo(x, y - r * stretch)
        g.bezierCurveTo(x + r * 0.4, y - r * stretch * 0.5, x + r, y - r * 0.5, x + r, y)
        g.arc(x, y, r, 0, Math.PI)
        g.bezierCurveTo(x - r, y - r * 0.5, x - r * 0.4, y - r * stretch * 0.5, x, y - r * stretch)
        g.fill()
        g.fillStyle = 'rgba(255,255,255,.35)'
        g.beginPath()
        g.ellipse(x - r * 0.35, y - r * 0.2, r * 0.22, r * 0.4, -0.4, 0, Math.PI * 2)
        g.fill()
        return
      }
      const st = phase === 'splash' ? t / CONTACT_SCENE.splash : 1
      const wt = phase === 'write' ? t / CONTACT_SCENE.write : phase === 'splash' ? 0 : 1
      if (blot && wt < 1 && motion) {
        // Soaking out through the fibres: a pale halo that keeps widening.
        const soak = easeOut(Math.min(1, st)) * (1 + 0.45 * easeOut(wt))
        g.fillStyle = inkA(0.12 * (1 - smooth(wt)))
        blotPath(g, x, landY, blot.halo, R * 1.15 * soak, sq)
        g.fill()
        // The crown: tapered streaks thrown out on impact, each ending in a droplet.
        const crown = easeOut(Math.min(1, st / 0.45))
        const gone = 1 - smooth(Math.min(1, wt / 0.7))
        for (const sp of blot.spikes) {
          const len = R * (1 + sp.len * crown)
          const ca = Math.cos(sp.a)
          const sa = Math.sin(sp.a)
          const w = R * sp.w * (1 - 0.5 * crown)
          g.fillStyle = inkA(0.9 * gone)
          g.beginPath()
          g.moveTo(x + (ca * R * 0.7 - sa * w), landY + (sa * R * 0.7 + ca * w) * sq)
          g.lineTo(x + ca * len, landY + sa * len * sq)
          g.lineTo(x + (ca * R * 0.7 + sa * w), landY + (sa * R * 0.7 - ca * w) * sq)
          g.closePath()
          g.fill()
          if (crown > 0.6) {
            g.beginPath()
            g.arc(x + ca * len, landY + sa * len * sq, R * sp.w * 0.45, 0, Math.PI * 2)
            g.fill()
          }
        }
        // Droplets flung further, slowing as they fly.
        const fly = easeOut(Math.min(1, st / 0.6))
        for (const d of blot.drops) {
          g.fillStyle = inkA(0.85 * gone)
          g.beginPath()
          g.arc(x + Math.cos(d.a) * R * (0.8 + d.d * fly), landY + Math.sin(d.a) * R * (0.8 + d.d * fly) * sq, d.s * (0.6 + 0.4 * fly), 0, Math.PI * 2)
          g.fill()
        }
        // The blot lands with a little overshoot, then gathers itself into the word.
        const body = (phase === 'splash' ? 1 + 0.12 * Math.sin(Math.min(1, st) * Math.PI) * (1 - st) : 1) * easeOut(Math.min(1, st / 0.35)) * (1 - 0.65 * smooth(wt))
        g.fillStyle = inkA(0.95 * (1 - smooth(Math.min(1, wt / 0.85))))
        blotPath(g, x, landY, blot.r, R * body, sq)
        g.fill()
        g.strokeStyle = inkA(0.35 * (1 - smooth(wt)))
        g.lineWidth = 1.2
        blotPath(g, x, landY, blot.r, R * body * 1.04, sq)
        g.stroke()
      }
      if (phase === 'splash') return
      const { fs, tw, cx } = metrics()
      const alpha = phase === 'fade' ? 1 - smooth(t / CONTACT_SCENE.fade) : 1
      // Damp paper round the word while it is pointed at: stacked, fading layers, no hard rim.
      if (wet > 0.01 && blot) {
        const sx = tw / 2 + 24 + wet * 10
        const sy = (fs * 0.8) / sx
        for (const [scale, a] of [[1.12, 0.025], [1, 0.035], [0.86, 0.035], [0.7, 0.03]]) {
          g.fillStyle = `rgba(120,108,84,${(a * wet).toFixed(3)})`
          blotPath(g, cx, landY, blot.stain, sx * scale, sy)
          g.fill()
        }
        g.strokeStyle = `rgba(110,98,74,${(0.05 * wet).toFixed(3)})`
        g.lineWidth = 1.5
        blotPath(g, cx, landY, blot.stain, sx, sy)
        g.stroke()
      }
      // Ink runs from the blot into the letters along thin tendrils, then the word fills out from the blot.
      if (blot && wt < 1 && motion) {
        const run = easeOut(Math.min(1, wt / 0.6))
        const fadeOut = 1 - smooth(Math.min(1, Math.max(0, wt - 0.4) / 0.5))
        g.strokeStyle = inkA(0.6 * fadeOut)
        g.lineCap = 'round'
        for (const td of blot.tendrils) {
          const tx = cx - tw / 2 + td.u * tw
          const ty = landY + td.v * fs
          g.lineWidth = 1.6 * fadeOut + 0.4
          g.beginPath()
          g.moveTo(x, landY)
          g.quadraticCurveTo((x + tx) / 2 + td.bend, (landY + ty) / 2 - Math.abs(td.bend) * 0.3, x + (tx - x) * run, landY + (ty - landY) * run)
          g.stroke()
        }
      }
      const reveal = motion ? smooth(Math.min(1, wt / 0.9)) : 1
      const far = Math.max(Math.hypot(cx - tw / 2 - x, fs), Math.hypot(cx + tw / 2 - x, fs)) + 16
      g.save()
      g.beginPath()
      g.ellipse(x, landY, far * reveal + 0.1, far * reveal * 0.7 + 0.1, 0, 0, Math.PI * 2)
      g.clip()
      g.font = `${fs}px ${brushFont}`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      // Fresh ink bleeds a little and sharpens as it dries; damp paper makes it bleed again.
      const bleed = 0.22 * (1 - reveal) + 0.08 + 0.18 * wet
      for (const [ox, oy] of [[1.4, 1], [-1.2, 0.8], [0.6, -1.3]]) {
        g.fillStyle = inkA(bleed * alpha)
        g.fillText(channels[idx].label, cx + ox * (1 + wet), landY + oy * (1 + wet))
      }
      if (wet > 0.01) {
        g.shadowColor = inkA(0.45 * wet * alpha)
        g.shadowBlur = 3 * wet
      }
      g.fillStyle = inkA(0.95 * alpha)
      g.fillText(channels[idx].label, cx, landY)
      g.restore()
    }

    const step = (dt: number) => {
      t += dt
      const wetTo = hover && (phase === 'hold' || phase === 'fade') ? 1 : 0
      const before = wet
      wet += (wetTo - wet) * Math.min(1, dt * 5)
      if (Math.abs(wet - before) > 0.002) dirty = true
      switch (phase) {
        case 'wait':
          if (t > 0.6) drop((idx + 1) % channels.length)
          return
        case 'fall':
          vy += 1500 * dt
          y += vy * dt
          if (y >= landY) {
            y = landY
            phase = 'splash'
            t = 0
          }
          break
        case 'splash':
          if (t > CONTACT_SCENE.splash) {
            phase = 'write'
            t = 0
          }
          break
        case 'write':
          if (t > CONTACT_SCENE.write) {
            phase = 'hold'
            t = 0
            placeWord(true)
          }
          break
        case 'hold':
          if (hover) t = Math.min(t, CONTACT_SCENE.hold - 0.4)
          if (t > CONTACT_SCENE.hold) {
            phase = 'fade'
            t = 0
          } else if (!dirty) return
          break
        case 'fade':
          if (hover) {
            phase = 'hold'
            t = CONTACT_SCENE.hold - 0.6
          } else if (t > CONTACT_SCENE.fade) {
            phase = 'wait'
            t = 0
            placeWord(false)
          }
          break
      }
      render()
    }

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      step(dt)
    }
    const start = (): void => {
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

    controls.current = {
      drop: (i) => {
        if (i !== idx || phase === 'wait' || phase === 'fade') drop(i)
      },
      setHover: (on) => {
        hover = on
        dirty = true
        if (!motion) {
          wet = on ? 1 : 0
          render()
        }
        start()
      },
    }

    size()
    if (!motion) drop(0)
    // The brush hand may not be loaded yet (the Chinese page shows it nowhere else): redraw once it is.
    void document.fonts
      ?.load(`48px ${brushFont}`)
      .then(() => {
        if (disposed) return
        dirty = true
        if (phase === 'hold' || !motion) {
          render()
          placeWord(true)
        }
      })
      .catch(() => {})
    const resize = new ResizeObserver(() => {
      size()
      if (phase === 'hold' || !motion) {
        landY = titleBottom() + clamp(height * 0.09, 46, 96)
        render()
        placeWord(true)
      }
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
    start()

    return () => {
      disposed = true
      stop()
      resize.disconnect()
      watch?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      controls.current = { drop: () => {}, setHover: () => {} }
      report.current(null)
      reportDrop.current(null)
    }
    // `labels` stands for `channels` (a new array every render, the same words).
  }, [scope, inkRef, brushesRef, wordRef, labels, motion]) // eslint-disable-line react-hooks/exhaustive-deps

  return controls
}
