import { describe, expect, it } from 'vitest'
import { formatMonth } from './formatMonth'

describe('formatMonth', () => {
  it('writes an English month label', () => {
    expect(formatMonth('2023-11', 'en')).toBe('Nov 2023')
    expect(formatMonth('2020-08', 'en')).toBe('Aug 2020')
  })

  it('writes a Chinese date, with no English month name', () => {
    expect(formatMonth('2023-11', 'zh-Hant')).toBe('2023年11月')
    expect(formatMonth('2021-08', 'zh-Hant')).toBe('2021年8月')
  })

  it('falls back to English for any other tag', () => {
    expect(formatMonth('2022-10', 'fr')).toBe('Oct 2022')
  })

  it('returns an unparseable value unchanged rather than rendering NaN', () => {
    for (const value of ['2023', '2023-13', '2023-00', 'Nov 2023', '']) {
      expect(formatMonth(value, 'en')).toBe(value)
      expect(formatMonth(value, 'zh-Hant')).toBe(value)
    }
  })
})
