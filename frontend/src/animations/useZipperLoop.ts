import type { RefObject } from 'react'
import { gsap, MQ, runSafely, ScrollTrigger, useGSAP } from './gsap'
import { ZIPPER } from './motion'

/**
 * The closing screen's loop (`Closing.tsx`): the `[data-zipper-row]` rows travel up through the
 * sticky screen, driven by the scroll through the section plus a slow drift, and wrap around
 * endlessly (the rows are rendered several times over, so a wrap always happens off screen). Each
 * row parts around the title (`[data-zipper-title-text]`) as it passes its height: its label slides left and its
 * value right by a bell-shaped amount of the title's width, so the title shows through the gap like
 * an opening zipper. Transforms only; the drift runs only while the section is on screen.
 * `motionKey` (the row keys) rebuilds the loop when the rows change.
 */
export function useZipperLoop(scope: RefObject<HTMLElement | null>, motionKey: string): void {
  useGSAP(
    () => {
      const root = scope.current
      if (!root) return
      const mm = gsap.matchMedia()
      mm.add(
        { desktop: MQ.desktop, mobile: MQ.mobile },
        (ctx) => {
          const { desktop, mobile } = ctx.conditions as Record<string, boolean>
          if (!desktop && !mobile) return
          let tick: (() => void) | null = null
          let moved: HTMLElement[] = []
          const local = runSafely(() => {
            const screen = root.querySelector<HTMLElement>('[data-zipper-screen]')
            const title = root.querySelector<HTMLElement>('[data-zipper-title-text]')
            const rows = gsap.utils.toArray<HTMLElement>('[data-zipper-row]', root)
            if (!screen || !title || rows.length === 0) return
            const labels = rows.map((row) => row.querySelector<HTMLElement>('[data-zipper-label]') ?? row)
            const values = rows.map((row) => row.querySelector<HTMLElement>('[data-zipper-value]') ?? row)
            moved = [...rows, ...labels, ...values]
            const setY = rows.map((row) => gsap.quickSetter(row, 'y', 'px'))
            const setLabelX = labels.map((label) => gsap.quickSetter(label, 'x', 'px'))
            const setValueX = values.map((value) => gsap.quickSetter(value, 'x', 'px'))

            let pitch = 1
            let loop = 1
            let height = 1
            let open = 0
            let centre = 0
            const measure = () => {
              pitch = rows[0].offsetHeight || 1
              loop = pitch * rows.length
              height = screen.clientHeight
              const box = title.getBoundingClientRect()
              centre = box.top + box.height / 2 - screen.getBoundingClientRect().top
              // Each side moves by half the title plus a margin, less the half gap the row already has.
              open = title.getBoundingClientRect().width / 2 + ZIPPER.margin - ZIPPER.baseGap / 2
            }

            let progress = 0
            let drift = 0
            let active = false
            let last = performance.now()
            const render = () => {
              const offset = progress * loop * ZIPPER.scroll + drift
              const sigma = pitch * ZIPPER.spread
              rows.forEach((_, i) => {
                const natural = i * pitch
                // Wrapped into [0, loop), then centred on the screen: wraps happen above and below it.
                const y = ((((natural - offset) % loop) + loop) % loop) - (loop - height) / 2
                setY[i](y - natural)
                const distance = y + pitch / 2 - centre
                const part = open * Math.exp(-(distance * distance) / (2 * sigma * sigma))
                setLabelX[i](-part)
                setValueX[i](part)
              })
            }

            measure()
            render()
            ScrollTrigger.create({
              trigger: root,
              start: 'top bottom',
              end: 'bottom bottom',
              onUpdate: (self) => {
                progress = self.progress
                render()
              },
              onRefresh: (self) => {
                measure()
                progress = self.progress
                render()
              },
            })
            // The drift runs while any of the section is on screen, including below the progress
            // range's end (the page footer follows it).
            ScrollTrigger.create({
              trigger: root,
              start: 'top bottom',
              end: 'bottom top',
              onToggle: (self) => {
                active = self.isActive
              },
            })
            tick = () => {
              const now = performance.now()
              if (active) {
                drift += ((now - last) / 1000) * (desktop ? ZIPPER.drift : ZIPPER.driftMobile)
                render()
              }
              last = now
            }
            gsap.ticker.add(tick)
          }, root)
          return () => {
            if (tick) gsap.ticker.remove(tick)
            // quickSetter writes are not recorded by the context: clear them explicitly.
            if (moved.length > 0) gsap.set(moved, { clearProps: 'transform' })
            local.revert()
          }
        },
        root,
      )
      return () => mm.revert()
    },
    { scope, dependencies: [motionKey], revertOnUpdate: true },
  )
}
