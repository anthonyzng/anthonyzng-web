import { describe, expect, it } from 'vitest'
import { COLLECTION_IDS, getCollection } from './collections'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object') for (const [nested, leaf] of flatten(value, path)) out.set(nested, leaf)
    else out.set(path, value)
  }
  return out
}

const placeholders = (value: string) => [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]).sort()

const enKeys = flatten(en as Tree)
const zhKeys = flatten(zhHant as Tree)
const PLURAL = /_(zero|one|two|few|many|other)$/

/** Every admin source file (tests and test helpers excluded), as text. */
const sources = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}', '!./test/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** A key exists as written, or as the plural forms i18next picks from it. */
const defined = (keys: Map<string, unknown>, key: string) => keys.has(key) || keys.has(`${key}_other`)

describe('admin locales', () => {
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
      expect(placeholders(zhKeys.get(key) as string), key).toEqual(placeholders(value as string))
    }
  })

  it('give every plural an _other form', () => {
    for (const key of enKeys.keys()) {
      const match = PLURAL.exec(key)
      if (match) expect(enKeys.has(key.replace(PLURAL, '_other')), key).toBe(true)
    }
  })

  it('translate the Chinese strings instead of copying the English ones', () => {
    const same = [...enKeys].filter(([key, value]) => zhKeys.get(key) === value).map(([key]) => key)
    expect(same).toEqual([])
  })

  it('define every key the admin code asks for by name', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20)
    const used = new Set<string>()
    for (const source of Object.values(sources)) {
      for (const match of source.matchAll(/\bt\(\s*['`]([\w.-]+)['`]/g)) used.add(match[1])
    }
    expect(used.size).toBeGreaterThan(50)
    const missing = [...used].filter((key) => !defined(enKeys, key) || !defined(zhKeys, key))
    expect(missing).toEqual([])
  })

  it('define the names, descriptions, labels and hints the collection configs refer to', () => {
    const keys = new Set<string>()
    for (const id of COLLECTION_IDS) {
      keys.add(`collections.${id}`)
      keys.add(`list.about.${id}`)
      for (const field of getCollection(id)!.fields) {
        keys.add(`fields.${field.label}`)
        if (field.hint) keys.add(`hints.${field.hint}`)
      }
    }
    const missing = [...keys].filter((key) => !enKeys.has(key) || !zhKeys.has(key))
    expect(missing).toEqual([])
  })
})
