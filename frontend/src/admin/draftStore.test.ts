import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearDraft, readDraft, writeDraft } from './draftStore'

const LIKE = { slug: '', name: '', inProgress: false }
const BASE = '2026-09-01T10:00:00Z'

describe('draftStore', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('keeps a draft per row for the tab, with the version it started from, and forgets it on request', () => {
    writeDraft('certifications/pm', { slug: 'pm', name: 'Draft', inProgress: true }, BASE)
    expect(readDraft('certifications/pm', LIKE)).toEqual({ draft: { slug: 'pm', name: 'Draft', inProgress: true }, base: BASE })
    writeDraft('certifications/new', { slug: '', name: 'New', inProgress: false }, null)
    expect(readDraft('certifications/new', LIKE)?.base).toBeNull()
    expect(readDraft('certifications/other', LIKE)).toBeNull()
    clearDraft('certifications/pm')
    expect(readDraft('certifications/pm', LIKE)).toBeNull()
  })

  it('ignores anything that does not have the shape of the form', () => {
    sessionStorage.setItem('admin:draft:a', '{"v":1,"base":null,"draft":{"slug":"x"}}')
    sessionStorage.setItem('admin:draft:b', 'not json')
    sessionStorage.setItem('admin:draft:c', '{"slug":"x","name":"y","inProgress":true}')
    for (const id of ['a', 'b', 'c']) expect(readDraft(id, LIKE)).toBeNull()
  })

  it('keeps drafts in a versioned format and ignores one kept by another build', () => {
    writeDraft('certifications/pm', { slug: 'pm', name: 'Draft', inProgress: true }, BASE)
    expect(JSON.parse(sessionStorage.getItem('admin:draft:certifications/pm')!)).toMatchObject({ v: 1 })
    // The right shape, but no version (the format before) or another one (a later build): not poured into this form.
    const draft = { slug: 'pm', name: 'Old build', inProgress: true }
    sessionStorage.setItem('admin:draft:old', JSON.stringify({ base: BASE, draft }))
    sessionStorage.setItem('admin:draft:next', JSON.stringify({ v: 2, base: BASE, draft }))
    expect(readDraft('old', LIKE)).toBeNull()
    expect(readDraft('next', LIKE)).toBeNull()
  })

  it('does without storage when the browser refuses it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError')
    })
    expect(() => writeDraft('x', LIKE, null)).not.toThrow()
    expect(readDraft('x', LIKE)).toBeNull()
    expect(() => clearDraft('x')).not.toThrow()
  })
})
