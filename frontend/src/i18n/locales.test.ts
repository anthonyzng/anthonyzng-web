import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object') {
      for (const [nested, leaf] of flatten(value, path)) out.set(nested, leaf)
    } else {
      out.set(path, value)
    }
  }
  return out
}

const placeholders = (value: string) => [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort()

const enKeys = flatten(en as Tree)
const zhKeys = flatten(zhHant as Tree)

describe('locales', () => {
  it('have identical key sets', () => {
    const missingInZh = [...enKeys.keys()].filter((key) => !zhKeys.has(key))
    const missingInEn = [...zhKeys.keys()].filter((key) => !enKeys.has(key))
    expect({ missingInZh, missingInEn }).toEqual({ missingInZh: [], missingInEn: [] })
  })

  it('have only non-empty string values', () => {
    for (const [key, value] of [...enKeys, ...zhKeys]) {
      expect(typeof value, key).toBe('string')
      expect((value as string).trim().length, key).toBeGreaterThan(0)
    }
  })

  it('use the same {{placeholders}} in both languages', () => {
    for (const [key, value] of enKeys) {
      const other = zhKeys.get(key)
      if (typeof value !== 'string' || typeof other !== 'string') continue
      expect(placeholders(other), key).toEqual(placeholders(value))
    }
  })

  it('no longer contain the removed placeholder keys', () => {
    for (const keys of [enKeys, zhKeys]) {
      expect(keys.has('home.comingSoon')).toBe(false)
      expect(keys.has('home.name')).toBe(false)
      // The sections carry real content now, so the shared "coming soon" line is gone.
      expect(keys.has('sections.comingSoon')).toBe(false)
      // The contact form shipped, so the "form is on the way" note is gone with it.
      expect(keys.has('content.contact.formNote')).toBe(false)
    }
  })

  it('carries the contact form copy in both languages', () => {
    for (const key of ['contactForm.title', 'contactForm.submit', 'contactForm.success.body', 'contactForm.errors.generic']) {
      expect(enKeys.has(key), `en: ${key}`).toBe(true)
      expect(zhKeys.get(key), key).not.toEqual(enKeys.get(key))
    }
  })

  it('keep exactly the layout copy of the content sections', () => {
    // The content itself (roles, bullets, chips, labels of the channels, the location) comes from
    // the API or its saved snapshot; only the words the page wraps around it live here.
    const layout = [...enKeys.keys()].filter((key) => key.startsWith('content.')).sort()
    expect(layout).toEqual(
      [
        'content.techOf',
        'content.experience.present',
        'content.projects.note',
        'content.projects.visit',
        'content.projects.placeholder.badge',
        'content.projects.placeholder.title',
        'content.projects.placeholder.summary',
        'content.skills.credentials.title',
        'content.skills.credentials.education.label',
        'content.skills.credentials.certifications.label',
        'content.skills.credentials.certifications.inProgress',
        'content.skills.credentials.languages.label',
        'content.contact.labels.cv',
        'content.contact.labels.location',
        'content.contact.cvDownload',
      ].sort(),
    )
  })

  it('translates the layout copy the Chinese page shows next to the content', () => {
    for (const key of ['content.experience.present', 'content.projects.note', 'content.contact.labels.cv', 'content.contact.cvDownload']) {
      expect(zhKeys.get(key), key).not.toEqual(enKeys.get(key))
    }
  })
})
