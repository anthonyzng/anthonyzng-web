import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { COLLECTION_IDS } from '../collections'
import { AdminLink } from '../components/AdminLink'
import { LoadError } from '../components/LoadError'
import { LoadingState } from '../components/LoadingState'
import { PageHeading } from '../components/PageHeading'
import { formatFileSize } from '../../i18n/formatFileSize'
import { usePageTitle } from '../hooks/usePageTitle'
import { ADMIN_NS } from '../i18n'
import { adminPaths } from '../paths'
import { useStatus } from '../shell/statusContext'
import { useSummary } from '../shell/summaryContext'
import { CARD, EYEBROW } from '../styles'

const TILE_BASE = `${CARD} flex h-full justify-between gap-3 px-5 py-4 transition-colors duration-200 hover:text-accent`
/** A collection and its count on one line: eight of them stay compact on a phone. */
const COUNT_TILE = `${TILE_BASE} items-center`
const TILE = `${TILE_BASE} flex-col`

/** Counts per collection, unread messages, whether a CV is online, and how the static fallback is refreshed. */
export function DashboardPage() {
  const { t, i18n } = useTranslation(ADMIN_NS)
  const { announce } = useStatus()
  const { summary, status, unread, refresh } = useSummary()
  const contentHeading = useId()
  const inboxHeading = useId()
  // A Retry is waiting for its outcome: a success is announced here, a failure by LoadError's alert.
  const retrying = useRef(false)
  usePageTitle(t('dashboard.title'))

  // Fresh numbers on every visit; the layout's first load and this one share a single request.
  useEffect(() => refresh(), [refresh])

  useEffect(() => {
    if (!retrying.current || status === 'loading') return
    retrying.current = false
    if (summary !== null) announce(t('common.loaded'))
  }, [summary, status, announce, t])

  const retry = () => {
    retrying.current = true
    refresh()
  }

  return (
    <>
      <PageHeading>{t('dashboard.title')}</PageHeading>

      {summary === null ? (
        status === 'error' ? <LoadError onRetry={retry} className="mt-8" /> : <LoadingState className="mt-8" />
      ) : (
        <>
          <section aria-labelledby={contentHeading} className="mt-8">
            <h2 id={contentHeading} className={EYEBROW}>
              {t('dashboard.content')}
            </h2>
            <ul role="list" className="mt-3 grid gap-3 md:grid-cols-3">
              {COLLECTION_IDS.map((id) => {
                const count = summary.counts[id] ?? 0
                return (
                  <li key={id}>
                    <AdminLink to={adminPaths.collection(id)} className={COUNT_TILE}>
                      <span className="text-sm text-muted">{t(`collections.${id}`)}</span>{' '}
                      <span className="text-title font-semibold tabular-nums">
                        <span aria-hidden="true">{count}</span>
                        <span className="sr-only">{t('dashboard.items', { count })}</span>
                      </span>
                    </AdminLink>
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-labelledby={inboxHeading} className="mt-10">
            <h2 id={inboxHeading} className={EYEBROW}>
              {t('dashboard.inboxAndFiles')}
            </h2>
            <ul role="list" className="mt-3 grid gap-3 md:grid-cols-2">
              <li>
                <AdminLink to={adminPaths.messages(unread ? 'unread' : 'all')} className={TILE}>
                  <span className="text-sm text-muted">{t('nav.messages')}</span>{' '}
                  <span className="text-lg font-medium">{t('dashboard.unread', { count: unread ?? summary.unreadMessages })}</span>
                </AdminLink>
              </li>
              <li>
                <AdminLink to={adminPaths.cv} className={TILE}>
                  <span className="text-sm text-muted">{t('nav.cv')}</span>{' '}
                  <span className="text-lg font-medium wrap-anywhere">
                    {summary.cv
                      ? t('dashboard.cvOnline', { filename: summary.cv.filename, size: formatFileSize(summary.cv.size, i18n.language) })
                      : t('dashboard.cvMissing')}
                  </span>
                </AdminLink>
              </li>
            </ul>
          </section>

          <aside className="mt-10 border border-line p-6">
            <h2 className="font-medium">{t('dashboard.syncTitle')}</h2>
            <p className="mt-2 text-sm text-muted">{t('dashboard.syncBody')}</p>
            <p className="mt-3 bg-surface px-3 py-3 font-mono text-sm wrap-anywhere">
              <code>npm run content:sync</code>
            </p>
            <p className="mt-3 text-sm text-muted">{t('dashboard.syncLater')}</p>
          </aside>
        </>
      )}
    </>
  )
}
