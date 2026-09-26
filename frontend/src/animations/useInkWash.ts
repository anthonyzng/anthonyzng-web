import type { RefObject } from 'react'
import { gsap, headerOffset, MQ, runSafely, ScrollTrigger, useGSAP } from './gsap'
import { createInkRenderer, parseHexColor, type InkRenderer } from './inkWash'
import { INK } from './motion'

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** The page background (`--bg`), which the ink is drawn in, so the hero washes into the page. */
function pageColor(): [number, number, number] {
  return parseHexColor(getComputedStyle(document.documentElement).getPropertyValue('--bg')) ?? [0, 0, 0]
}

/** The wet edge pools darker: strongly on light paper, gently on the dark page (already near black). */
const poolFor = (): number => (document.documentElement.dataset.theme === 'dark' ? INK.poolDark : INK.poolLight)

/**
 * Ink wash over the hero while it scrolls away (`inkWash.ts` draws it): the scroll progress over the
 * hero's travel under the header becomes the amount of ink, which covers it completely at
 * `INK.full`; scrolling back withdraws it. While partly inked it drifts slowly (drawn each frame
 * from gsap's ticker); fully inked or bare, nothing is drawn. The ink follows the theme's
 * background. Reduced motion, no WebGL or a lost context: the canvas stays empty and the hero static.
 */
export function useInkWash(scope: RefObject<HTMLElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>): void {
  useGSAP(
    () => {
      const root = scope.current
      const canvas = canvasRef.current
      if (!root || !canvas) return
      const mm = gsap.matchMedia()
      mm.add(
        { desktop: MQ.desktop, mobile: MQ.mobile },
        (ctx) => {
          const { desktop, mobile } = ctx.conditions as Record<string, boolean>
          if (!desktop && !mobile) return
          let renderer: InkRenderer | null = null
          let resize: ResizeObserver | null = null
          let theme: MutationObserver | null = null
          let tick: (() => void) | null = null
          let lost = false
          const onLost = () => {
            lost = true
          }
          const local = runSafely(() => {
            renderer = createInkRenderer(canvas)
            if (!renderer) return
            const ink = renderer
            const scale = Math.min(window.devicePixelRatio || 1, 2) * (desktop ? INK.scale : INK.scaleMobile)
            const started = performance.now()
            let amount = 0
            let color = pageColor()
            let pool = poolFor()

            const draw = () => {
              if (lost) return
              const rect = root.getBoundingClientRect()
              const height = rect.height || 1
              const view = [clamp01((headerOffset() - rect.top) / height), clamp01((window.innerHeight - rect.top) / height)] as const
              ink.draw({ amount, view, time: (performance.now() - started) / 1000, color, pool })
            }
            const size = () => {
              ink.resize(root.clientWidth * scale, root.clientHeight * scale)
              draw()
            }

            canvas.addEventListener('webglcontextlost', onLost)
            size()
            resize = new ResizeObserver(size)
            resize.observe(root)
            theme = new MutationObserver(() => {
              color = pageColor()
              pool = poolFor()
              draw()
            })
            theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

            // The same travel as the hero parallax: from scroll 0 until the hero is under the header.
            ScrollTrigger.create({
              trigger: root,
              start: () => `top top+=${headerOffset()}`,
              end: () => `bottom top+=${headerOffset()}`,
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                amount = clamp01((self.progress - INK.start) / (INK.full - INK.start))
                draw()
              },
              // A page restored partway down the hero shows its ink at once, not after the next scroll.
              onRefresh: (self) => {
                amount = clamp01((self.progress - INK.start) / (INK.full - INK.start))
                draw()
              },
            })
            // The drift is slow: redrawing it at INK.driftFps is enough while the reader rests mid-hero.
            let lastDrift = 0
            tick = () => {
              const now = performance.now()
              if (amount <= 0 || amount >= 1 || now - lastDrift < 1000 / INK.driftFps) return
              lastDrift = now
              draw()
            }
            gsap.ticker.add(tick)
          }, root)
          return () => {
            if (tick) gsap.ticker.remove(tick)
            resize?.disconnect()
            theme?.disconnect()
            canvas.removeEventListener('webglcontextlost', onLost)
            renderer?.draw({ amount: 0, view: [0, 1], time: 0, color: [0, 0, 0], pool: 0 })
            renderer?.dispose()
            local.revert()
          }
        },
        root,
      )
      return () => mm.revert()
    },
    { scope },
  )
}
