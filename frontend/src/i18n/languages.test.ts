import { describe, expect, it } from 'vitest'
import { languageFromSlug, resolveLanguage, slugFromLanguage } from './languages'

describe('languages', () => {
  it('maps URL slugs to locale codes, case-insensitively', () => {
    expect(languageFromSlug('en')).toBe('en')
    expect(languageFromSlug('zh-hant')).toBe('zh-Hant')
    expect(languageFromSlug('ZH-HANT')).toBe('zh-Hant')
    expect(languageFromSlug('fr')).toBeNull()
    expect(languageFromSlug(undefined)).toBeNull()
  })

  it('maps locale codes to URL slugs', () => {
    expect(slugFromLanguage('en')).toBe('en')
    expect(slugFromLanguage('zh-Hant')).toBe('zh-hant')
  })

  it('resolves browser tags onto supported locales', () => {
    expect(resolveLanguage('zh-TW')).toBe('zh-Hant')
    expect(resolveLanguage('zh-HK')).toBe('zh-Hant')
    expect(resolveLanguage('en-GB')).toBe('en')
    expect(resolveLanguage('ja')).toBe('en')
    expect(resolveLanguage(null)).toBe('en')
  })
})
