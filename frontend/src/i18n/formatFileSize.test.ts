import { describe, expect, it } from 'vitest'
import { formatFileSize } from './formatFileSize'

describe('formatFileSize', () => {
  it('shows whole kilobytes below a thousand, never zero', () => {
    expect(formatFileSize(1, 'en')).toBe('1 KB')
    expect(formatFileSize(184_320, 'en')).toBe('180 KB')
    expect(formatFileSize(1_022_975, 'en')).toBe('999 KB')
  })

  it('switches to megabytes with one decimal', () => {
    expect(formatFileSize(1_023_488, 'en')).toBe('1 MB')
    expect(formatFileSize(1_468_006, 'en')).toBe('1.4 MB')
    expect(formatFileSize(10 * 1024 * 1024, 'zh-Hant')).toBe('10 MB')
  })

  it('formats the number for the locale', () => {
    expect(formatFileSize(1_468_006, 'zh-Hant')).toBe('1.4 MB')
    expect(formatFileSize(1_468_006, 'de')).toBe('1,4 MB')
  })
})
