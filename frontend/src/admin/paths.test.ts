import { describe, expect, it } from 'vitest'
import { adminPaths, readMessagesSearch } from './paths'

const AS_OF = '2026-09-23T12:00:00.123456Z'

describe('inbox URLs', () => {
  it('carry asOf on the later pages only', () => {
    expect(adminPaths.messages()).toBe('/admin/messages')
    expect(adminPaths.messages('unread')).toBe('/admin/messages?status=unread')
    expect(adminPaths.messages('all', 1, AS_OF)).toBe('/admin/messages')
    expect(adminPaths.messages('unread', 2, AS_OF)).toBe(`/admin/messages?status=unread&page=2&asOf=${encodeURIComponent(AS_OF)}`)
    expect(adminPaths.messages('all', 3)).toBe('/admin/messages?page=3')
  })

  it('read back what they write', () => {
    for (const [view, page, asOf] of [
      ['all', 1, null],
      ['unread', 2, AS_OF],
      ['all', 40, '2026-09-23T12:00:00+08:00'],
    ] as const) {
      const search = adminPaths.messages(view, page, asOf).split('?')[1] ?? ''
      expect(readMessagesSearch(`?${search}`)).toEqual({ view, page, asOf })
    }
  })

  it('fall back to page 1 for anything but a sane positive integer, and keep no asOf there', () => {
    for (const page of ['', 'abc', '0', '-2', '1.5', '2e3', '02', ' 3', '99999999', '99999999999']) {
      expect(readMessagesSearch(`?page=${encodeURIComponent(page)}&asOf=${encodeURIComponent(AS_OF)}`), page).toEqual({
        view: 'all',
        page: 1,
        asOf: null,
      })
    }
    expect(readMessagesSearch('?page=9999999').page).toBe(9_999_999)
    expect(readMessagesSearch('?status=nonsense').view).toBe('all')
  })

  it('drop an asOf the API would refuse', () => {
    for (const asOf of ['yesterday', '2026-09-23', '2026-09-23T12:00:00', '1695470400']) {
      expect(readMessagesSearch(`?page=2&asOf=${encodeURIComponent(asOf)}`).asOf, asOf).toBeNull()
    }
  })
})
