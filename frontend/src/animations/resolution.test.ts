import { afterEach, describe, expect, it } from 'vitest'
import { CANVAS_BUDGET } from './motion'
import { canvasScale } from './resolution'

const setDpr = (value: number) => Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value })

describe('canvasScale', () => {
  afterEach(() => setDpr(1))

  it('keeps an ordinary screen at its own density, capped', () => {
    setDpr(1)
    expect(canvasScale(1920, 1080, 1.5, CANVAS_BUDGET.backdrop)).toBe(1)
    setDpr(2)
    // A laptop's retina screen: capped at 1.5, then lowered, since 1440×900 at 1.5 would be 2.9 MP.
    expect(canvasScale(1440, 900, 1.5, CANVAS_BUDGET.backdrop)).toBeCloseTo(Math.sqrt(2_100_000 / (1440 * 900)), 5)
  })

  it('holds a 4K screen within the budget, never below its floor', () => {
    setDpr(1.5)
    // 2560×1440 CSS pixels at 1.5: 8.3 MP unbudgeted.
    const shader = canvasScale(2560, 1440, 1.5, CANVAS_BUDGET.shader)
    expect(2560 * 1440 * shader ** 2).toBeCloseTo(2_100_000, -3)
    const backdrop = canvasScale(2560, 1440, 1.5, CANVAS_BUDGET.backdrop)
    expect(2560 * 1440 * backdrop ** 2).toBeCloseTo(2_100_000, -3)
    // A still larger window reaches the backdrop's floor.
    expect(canvasScale(3840, 2160, 1.5, CANVAS_BUDGET.backdrop)).toBe(0.75)
    // The contact canvases write words: never below one device pixel per CSS pixel.
    expect(canvasScale(2560, 1440, 1.5, CANVAS_BUDGET.contact)).toBe(1)
  })

  it('never raises a low-density screen to its floor', () => {
    setDpr(0.5)
    expect(canvasScale(3840, 2160, 1.5, CANVAS_BUDGET.contact)).toBe(0.5)
  })
})
