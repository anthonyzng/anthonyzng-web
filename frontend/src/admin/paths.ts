import type { CollectionId } from './collections'
import type { MessageView } from './api'

/** Every admin URL, in one place. The panel lives at /admin with no language prefix. */
export const adminPaths = {
  dashboard: '/admin',
  login: '/admin/login',
  collection: (id: CollectionId): string => `/admin/content/${id}`,
  create: (id: CollectionId): string => `/admin/content/${id}/new`,
  edit: (id: CollectionId, slug: string): string => `/admin/content/${id}/${encodeURIComponent(slug)}`,
  /** `asOf` (the moment the first page was taken at) goes with the later pages only: page 1 always starts afresh. */
  messages: (view: MessageView = 'all', page = 1, asOf: string | null = null): string => {
    const params = new URLSearchParams()
    if (view !== 'all') params.set('status', view)
    if (page > 1) params.set('page', String(page))
    if (page > 1 && asOf !== null) params.set('asOf', asOf)
    const query = params.toString()
    return query ? `/admin/messages?${query}` : '/admin/messages'
  },
  cv: '/admin/cv',
  security: '/admin/security',
} as const

/** 1 to 9,999,999: far beyond any real inbox, and well inside the API's offset range. */
const PAGE = /^[1-9]\d{0,6}$/

/** An ISO 8601 instant, as the API writes `asOf`; anything else would only earn a 422. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/**
 * The inbox's view, page and `asOf`, read defensively from its URL (typed, bookmarked or stale):
 * a page that is not a sane positive integer is page 1, and page 1 never keeps an `asOf`.
 */
export function readMessagesSearch(search: string): { view: MessageView; page: number; asOf: string | null } {
  const params = new URLSearchParams(search)
  const view: MessageView = params.get('status') === 'unread' ? 'unread' : 'all'
  const rawPage = params.get('page') ?? ''
  const page = PAGE.test(rawPage) ? Number(rawPage) : 1
  const rawAsOf = params.get('asOf')
  const asOf = page > 1 && rawAsOf !== null && INSTANT.test(rawAsOf) ? rawAsOf : null
  return { view, page, asOf }
}
