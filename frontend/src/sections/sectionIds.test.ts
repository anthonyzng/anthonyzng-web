import { describe, expect, it } from 'vitest'
import { formatGhostNumeral, formatIndex } from './sectionIds'

describe('section numbering', () => {
  it('keeps the counter in Arabic numerals', () => {
    expect([0, 1, 2, 3].map(formatIndex)).toEqual(['01', '02', '03', '04'])
  })

  it('draws the ghost numerals as formal Chinese numerals in light mode and Roman numerals in dark mode', () => {
    expect([0, 1, 2, 3, 9].map((i) => formatGhostNumeral(i, 'light'))).toEqual(['壹', '貳', '參', '肆', '拾'])
    expect([0, 1, 2, 3, 8].map((i) => formatGhostNumeral(i, 'dark'))).toEqual(['I', 'II', 'III', 'IV', 'IX'])
    // Past ten, the plain number.
    expect(formatGhostNumeral(10, 'light')).toBe('11')
  })
})
