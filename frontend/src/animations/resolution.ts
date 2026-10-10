export interface CanvasBudget {
  /** The most device pixels a canvas of this kind may hold. */
  pixels: number
  /** The device pixels per CSS pixel it never drops below (1 keeps drawn text crisp). */
  floor: number
}

/**
 * Device pixels per CSS pixel for a canvas of this CSS size: the screen's density, capped at `maxDpr`,
 * and lowered further so the canvas never holds more than its budget. A 4K screen (or a large window
 * at a high density) then draws these soft scenes at a lower resolution and the browser scales them
 * up, instead of filling 8 million pixels a frame; an ordinary screen keeps its full density.
 */
export function canvasScale(cssWidth: number, cssHeight: number, maxDpr: number, budget: CanvasBudget): number {
  const dpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, maxDpr)
  const area = Math.max(1, cssWidth * cssHeight)
  return Math.max(Math.min(budget.floor, dpr), Math.min(dpr, Math.sqrt(budget.pixels / area)))
}

