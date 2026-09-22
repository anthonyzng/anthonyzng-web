import { afterEach, describe, expect, it, vi } from 'vitest'
import { progressTarget, readProgress } from './readingPosition'

function rect(top: number, height: number): DOMRect {
  return { top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }
}

function mountRegion(top: number, height: number, headerHeight = 64) {
  document.body.innerHTML = '<header data-site-header></header><section id="statement"></section>'
  const header = document.querySelector('header')!
  const region = document.getElementById('statement')!
  vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(rect(0, headerHeight))
  vi.spyOn(region, 'getBoundingClientRect').mockReturnValue(rect(top, height))
}

describe('readingPosition', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('measures how far the reading line under the header is into the region', () => {
    mountRegion(64 - 250, 1000)
    expect(readProgress('statement')).toBeCloseTo(0.25)
  })

  it('clamps to 0 above the region and 1 below it', () => {
    mountRegion(400, 1000)
    expect(readProgress('statement')).toBe(0)
    mountRegion(-5000, 1000)
    expect(readProgress('statement')).toBe(1)
  })

  it('returns 0 for a missing or empty region', () => {
    expect(readProgress('statement')).toBe(0)
    mountRegion(-100, 0)
    expect(readProgress('statement')).toBe(0)
  })

  it('turns a progress back into a scroll position in the current layout', () => {
    mountRegion(1000, 800)
    // scrollY 0 + region top 1000 - header 64 + 0.5 * 800
    expect(progressTarget('statement', 0.5)).toBe(1336)
    expect(progressTarget('missing', 0.5)).toBeNull()
  })
})
