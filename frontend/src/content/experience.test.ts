import { describe, expect, it } from 'vitest'
import { EXPERIENCE } from './experience'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * The timeline is data the page renders verbatim (dates become both the visible label and the
 * <time datetime> value), and Phase 4 will feed the same shape from the API. These are the
 * invariants the view relies on but cannot check.
 */
describe('EXPERIENCE data', () => {
  it('has a unique id per entry', () => {
    const ids = EXPERIENCE.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('stores every date as a valid YYYY-MM month', () => {
    for (const entry of EXPERIENCE) {
      expect(entry.start, entry.id).toMatch(MONTH)
      if (entry.end !== null) expect(entry.end, entry.id).toMatch(MONTH)
    }
  })

  it('never ends a role before it started', () => {
    for (const entry of EXPERIENCE) {
      if (entry.end !== null) expect(entry.end >= entry.start, entry.id).toBe(true)
    }
  })

  it('lists the roles newest first, with only the first one current', () => {
    const starts = EXPERIENCE.map((entry) => entry.start)
    expect(starts).toEqual([...starts].sort().reverse())
    expect(EXPERIENCE.findIndex((entry) => entry.end === null)).toBeLessThanOrEqual(0)
  })

  it('describes every entry with at least one bullet', () => {
    for (const entry of EXPERIENCE) expect(entry.bullets.length, entry.id).toBeGreaterThan(0)
  })
})
