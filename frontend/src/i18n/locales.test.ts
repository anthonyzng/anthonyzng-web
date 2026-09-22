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

  it('no longer contain the removed Phase 1 keys', () => {
    for (const keys of [enKeys, zhKeys]) {
      expect(keys.has('home.comingSoon')).toBe(false)
      expect(keys.has('home.name')).toBe(false)
    }
  })
})
