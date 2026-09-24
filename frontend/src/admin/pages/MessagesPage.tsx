import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { isAbortError } from '../../api/client'
import { deleteMessage, fetchMessages, isUnauthorized, MESSAGES_PAGE_SIZE, setMessageRead, type MessageView } from '../api'
import { AdminLink } from '../components/AdminLink'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LoadError } from '../components/LoadError'
import { LoadingState } from '../components/LoadingState'
import { PageHeading } from '../components/PageHeading'
import { pageHeading } from '../dom'
import { useAdminQuery } from '../hooks/useAdminQuery'
import { useConfirmedAction } from '../hooks/useConfirmedAction'
import { useLifetimeSignal } from '../hooks/useLifetimeSignal'
import { usePageTitle } from '../hooks/usePageTitle'
import { ADMIN_NS } from '../i18n'
import { MessageRow } from '../messages/MessageRow'
import { adminPaths, readMessagesSearch } from '../paths'
import type { Message } from '../schemas'
import { useSession } from '../session/sessionContext'
import { useStatus } from '../shell/statusContext'
import { useSummary } from '../shell/summaryContext'
import { NAV_ITEM, NAV_ITEM_CURRENT, NAV_ITEM_IDLE, SECONDARY_BUTTON } from '../styles'

/**
 * The contact-form inbox, newest first, 50 per page, all or unread only (the view and the page
 * live in the URL, so Back and reload keep them). The first page is taken as of now and the later
 * pages as of that same moment (`asOf`, carried in their URLs), so messages that arrive, or are
 * read, while paging never shift a page. Opening a message marks it read; it can be marked unread
 * again or deleted (after a confirmation). The navigation badge follows every change. Moving to
 * another page puts focus on the heading and announces the new page.
 */
export function MessagesPage() {
  const { t } = useTranslation(ADMIN_NS)
  const { expire } = useSession()
  const { announce } = useStatus()
  const { setUnread, refresh } = useSummary()
  const lifetime = useLifetimeSignal()
  const navigate = useNavigate()
  // Read from the location rather than useSearchParams, which the public bundle does not otherwise carry.
  const { view, page, asOf } = readMessagesSearch(useLocation().search)
  // Page 1 carries no `asOf` in its URL: a reload after a delete passes the moment it was shown at.
  const reloadAsOf = useRef<string | null>(null)
  const { state, reload, retry, setData } = useAdminQuery(`messages:${view}:${page}:${asOf ?? ''}`, (signal) => {
    const moment = asOf ?? reloadAsOf.current
    reloadAsOf.current = null
    return fetchMessages(view, (page - 1) * MESSAGES_PAGE_SIZE, moment, signal)
  })
  const [openIds, setOpenIds] = useState<ReadonlySet<number>>(new Set())
  // Messages with a read/unread change in flight: one change at a time per message, or two PATCHes
  // could land in either order and leave the badge counting the wrong state.
  const pending = useRef(new Set<number>())
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set())
  const idBase = useId()
  usePageTitle(t('messages.title'))

  const data = state.data
  const serverUnread = state.status === 'ready' ? state.data.unread : null
  const pages = data ? Math.max(1, Math.ceil(data.total / MESSAGES_PAGE_SIZE)) : 1

  // The inbox's own count is the freshest one for the navigation badge.
  useEffect(() => {
    if (serverUnread !== null) setUnread(serverUnread)
  }, [serverUnread, setUnread])

  // A page emptied by deletions (or a stale link) falls back to the last page that has messages.
  useEffect(() => {
    if (state.status === 'ready' && state.data.items.length === 0 && page > 1) {
      const last = Math.max(1, Math.ceil(state.data.total / MESSAGES_PAGE_SIZE))
      void navigate(adminPaths.messages(view, Math.min(page - 1, last), state.data.asOf), { replace: true })
    }
  }, [state, page, view, navigate])

  // Another page of the same view (Next, Previous, the fallback above) is announced once its
  // messages are on screen; the heading already has focus (PageHeading).
  const shownPage = useRef<{ view: MessageView; page: number } | null>(null)
  useEffect(() => {
    if (state.status !== 'ready') return
    const previous = shownPage.current
    shownPage.current = { view, page }
    if (previous !== null && previous.view === view && previous.page !== page) announce(t('messages.pageOf', { page, pages }))
  }, [state.status, view, page, pages, announce, t])

  const rowId = (message: Message) => `${idBase}-${message.id}`

  const replace = (updated: Message) =>
    setData((current) => ({ ...current, items: current.items.map((item) => (item.id === updated.id ? updated : item)) }))

  const hold = (id: number) => {
    pending.current.add(id)
    setBusyIds(new Set(pending.current))
  }
  const release = (id: number) => {
    pending.current.delete(id)
    setBusyIds(new Set(pending.current))
  }

  const toggle = async (message: Message) => {
    const opening = !openIds.has(message.id)
    setOpenIds((current) => {
      const next = new Set(current)
      if (opening) next.add(message.id)
      else next.delete(message.id)
      return next
    })
    if (!opening || message.readAt !== null || pending.current.has(message.id)) return
    hold(message.id)
    try {
      const updated = await setMessageRead(message.id, true, lifetime())
      replace(updated)
      // At once for the badge, then the server's count (the message may have been read in another tab).
      if (updated.readAt !== null) setUnread((count) => count - 1)
      refresh({ force: true })
    } catch (error) {
      if (isAbortError(error)) return
      if (isUnauthorized(error)) expire()
      else announce(t('messages.markReadFailed'), 'error')
    } finally {
      release(message.id)
    }
  }

  const markUnread = async (message: Message) => {
    if (pending.current.has(message.id)) return
    hold(message.id)
    try {
      const updated = await setMessageRead(message.id, false, lifetime())
      replace(updated)
      if (message.readAt !== null && updated.readAt === null) setUnread((count) => count + 1)
      refresh({ force: true })
      setOpenIds((current) => {
        const next = new Set(current)
        next.delete(message.id)
        return next
      })
      // The panel (and the button that was pressed) closes: focus goes back to the message's toggle.
      document.getElementById(`${rowId(message)}-toggle`)?.focus()
      announce(t('messages.markedUnread', { name: message.name }), 'success')
    } catch (error) {
      if (isAbortError(error)) return
      if (isUnauthorized(error)) expire()
      else announce(t('messages.markUnreadFailed'), 'error')
    } finally {
      release(message.id)
    }
  }

  // A message already gone (deleted in another tab) counts as deleted. The page is fetched again
  // afterwards (as of the same moment): the next message moves up, and its `unread` count corrects the badge.
  const removal = useConfirmedAction({
    run: (message: Message, signal) => deleteMessage(message.id, signal),
    onDone: (message) => {
      setData((current) => ({
        ...current,
        items: current.items.filter((item) => item.id !== message.id),
        total: Math.max(0, current.total - 1),
      }))
      if (message.readAt === null) setUnread((count) => count - 1)
      announce(t('messages.deleted', { name: message.name }), 'success')
      reloadAsOf.current = data?.asOf ?? null
      reload()
    },
    failed: t('messages.deleteFailed'),
    notFoundIsDone: true,
  })

  return (
    <>
      <PageHeading>{t('messages.title')}</PageHeading>

      <nav aria-label={t('messages.viewLabel')} className="mt-6">
        <ul role="list" className="flex flex-wrap gap-2">
          {(['all', 'unread'] as const).map((option) => (
            <li key={option}>
              {/* A view starts on its first page, as of now. */}
              <AdminLink
                to={adminPaths.messages(option)}
                aria-current={view === option ? 'page' : undefined}
                className={`${NAV_ITEM} border border-line ${view === option ? NAV_ITEM_CURRENT : NAV_ITEM_IDLE}`}
              >
                {t(`messages.${option}`)}
              </AdminLink>
            </li>
          ))}
        </ul>
      </nav>

      {data === null ? (
        state.status === 'error' ? (
          <LoadError onRetry={retry} className="mt-6" />
        ) : (
          <LoadingState className="mt-6" />
        )
      ) : (
        <>
          {state.status === 'error' ? <LoadError stale onRetry={retry} className="mt-6" /> : null}
          {data.items.length === 0 ? (
            <p className="mt-6 border border-line p-6 text-muted">
              {view === 'unread' ? t('messages.emptyUnread') : t('messages.empty')}
            </p>
          ) : (
            <>
              <p className="mt-6 text-sm text-muted">{t('messages.count', { count: data.total })}</p>
              <ul
                role="list"
                aria-label={t('messages.title')}
                aria-busy={state.status === 'loading' || undefined}
                className="mt-2 border-b border-line"
              >
                {data.items.map((message) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    open={openIds.has(message.id)}
                    busy={busyIds.has(message.id)}
                    idPrefix={rowId(message)}
                    onToggle={() => void toggle(message)}
                    onMarkUnread={() => void markUnread(message)}
                    onDelete={() => removal.open(message)}
                  />
                ))}
              </ul>

              {pages > 1 ? (
                <nav aria-label={t('messages.pagination')} className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  {page > 1 ? (
                    <AdminLink to={adminPaths.messages(view, page - 1, data.asOf)} className={SECONDARY_BUTTON}>
                      {t('messages.previous')}
                    </AdminLink>
                  ) : (
                    <span />
                  )}
                  <p className="text-sm text-muted">{t('messages.pageOf', { page, pages })}</p>
                  {page < pages ? (
                    <AdminLink to={adminPaths.messages(view, page + 1, data.asOf)} className={SECONDARY_BUTTON}>
                      {t('messages.next')}
                    </AdminLink>
                  ) : (
                    <span />
                  )}
                </nav>
              ) : null}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        {...removal.dialog}
        title={t('messages.deleteTitle', { name: removal.target?.name ?? '' })}
        confirmLabel={t('messages.deleteConfirm')}
        busyLabel={t('messages.deleting')}
        fallbackFocus={pageHeading}
      >
        {t('messages.deleteBody')}
      </ConfirmDialog>
    </>
  )
}
