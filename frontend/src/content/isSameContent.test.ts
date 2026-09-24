import { describe, expect, it } from 'vitest'
import { isSameJson } from './isSameContent'
import { staticContent } from './staticContent'

describe('isSameJson', () => {
  it('compares structure, not key order or identity', () => {
    expect(isSameJson({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 })).toBe(true)
    expect(isSameJson(staticContent('en'), structuredClone(staticContent('en')))).toBe(true)
    expect(isSameJson(staticContent('en'), staticContent('zh-Hant'))).toBe(false)
    expect(isSameJson({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(isSameJson([1, 2], [2, 1])).toBe(false)
    expect(isSameJson(null, {})).toBe(false)
  })
})
