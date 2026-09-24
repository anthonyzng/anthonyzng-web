import { isObject, type Draft } from './draft'

/**
 * Unsaved editor drafts, kept per tab in sessionStorage (gone when the tab closes). An expired
 * session, Back/Forward or a reload would otherwise throw the typing away: the editor puts the
 * draft back when it opens again. Storage can be unavailable (private mode): then nothing is kept.
 */

export interface KeptDraft {
  draft: Draft
  /** The `updatedAt` of the row the draft started from (null for a new row). */
  base: string | null
}

/**
 * The format of a kept draft. Raise it whenever the draft shape of a form changes: a draft kept by
 * another build (the tab outlived a deploy) is then ignored instead of being poured into this form.
 */
const FORMAT = 1

const key = (id: string) => `admin:draft:${id}`

const sameKeys = (a: Draft, b: Draft) => Object.keys(a).sort().join() === Object.keys(b).sort().join()

/** The kept draft, only if it is of this build's format and has the shape of `like` (same keys): anything else is ignored. */
export function readDraft(id: string, like: Draft): KeptDraft | null {
  try {
    const raw = sessionStorage.getItem(key(id))
    if (raw === null) return null
    const value: unknown = JSON.parse(raw)
    if (!isObject(value) || value.v !== FORMAT || !isObject(value.draft) || !sameKeys(value.draft, like)) return null
    return { draft: value.draft, base: typeof value.base === 'string' ? value.base : null }
  } catch {
    return null
  }
}

export function writeDraft(id: string, draft: Draft, base: string | null): void {
  try {
    sessionStorage.setItem(key(id), JSON.stringify({ v: FORMAT, base, draft }))
  } catch {
    // Full or unavailable storage: the draft simply is not kept.
  }
}

export function clearDraft(id: string): void {
  try {
    sessionStorage.removeItem(key(id))
  } catch {
    // Unavailable storage holds nothing to clear.
  }
}
