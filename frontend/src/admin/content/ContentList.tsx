import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAbortError } from '../../api/client'
import { deleteItem, isUnauthorized, listItems, reorderItems } from '../api'
import type { Collection, ContentItem } from '../collections'
import { AdminLink } from '../components/AdminLink'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { IconButton } from '../components/IconButton'
import { LoadError } from '../components/LoadError'
import { LoadingState } from '../components/LoadingState'
import { PageHeading } from '../components/PageHeading'
import { pageHeading } from '../dom'
import { swapped } from '../draft'
import { useAdminQuery } from '../hooks/useAdminQuery'
import { useConfirmedAction } from '../hooks/useConfirmedAction'
import { useLifetimeSignal } from '../hooks/useLifetimeSignal'
import { usePageTitle } from '../hooks/usePageTitle'
import { ADMIN_NS } from '../i18n'
import { adminPaths } from '../paths'
import { useSession } from '../session/sessionContext'
import { useStatus } from '../shell/statusContext'
import { DANGER_BUTTON, EYEBROW, PRIMARY_BUTTON, SECONDARY_BUTTON } from '../styles'

/**
 * One collection's rows in display order: edit, delete (confirmed in a dialog) and move up / down.
 * A move shows at once, is saved with `POST …/reorder` and announced ("moved to position 2 of 5");
 * a failed move is rolled back and the list fetched again. Keyed rows keep focus on the button
 * that moved them. A move is always built from the list on screen, which takes in every answer the
 * server gives (a reorder, a delete, a reload); while a reload runs, moves and deletes wait for it,
 * and when one fails the list stays, with a notice and a retry.
 */
export function ContentList({ collection }: { collection: Collection }) {
  const { t, i18n } = useTranslation(ADMIN_NS)
  const { expire } = useSession()
  const { announce } = useStatus()
  const { state, reload, retry, setData } = useAdminQuery(`content:${collection.id}`, (signal) => listItems(collection, signal))
  const [moving, setMoving] = useState(false)
  const lifetime = useLifetimeSignal()
  const name = t(`collections.${collection.id}`)
  usePageTitle(name)

  const items = state.data
  // A reload's answer would replace whatever a move or a delete made of the list meanwhile.
  const busy = moving || state.status === 'loading'

  const move = async (index: number, delta: -1 | 1) => {
    if (items === null || busy) return
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const moved = items[index]
    const next = swapped(items, index, target)
    setData(() => next)
    setMoving(true)
    try {
      const saved = await reorderItems(
        collection,
        next.map((item) => item.slug),
        lifetime(),
      )
      setData(() => saved)
      const position = saved.findIndex((item) => item.slug === moved.slug) + 1
      announce(t('list.moved', { title: collection.title(moved, t), position, total: saved.length }), 'success')
    } catch (error) {
      if (isAbortError(error)) return // the page went away
      setData(() => items)
      if (isUnauthorized(error)) {
        expire()
        return
      }
      announce(t('list.moveFailed'), 'error')
      // The usual cause is a list changed elsewhere (another tab): fetch it again, so the next move
      // sends the slugs the server has instead of failing the same way.
      reload()
    } finally {
      setMoving(false)
    }
  }

  // A row already gone (deleted in another tab) counts as deleted: the list just catches up.
  const removal = useConfirmedAction({
    run: (item: ContentItem, signal) => deleteItem(collection, item.slug, signal),
    onDone: (item) => {
      setData((current) => current.filter((row) => row.slug !== item.slug))
      announce(t('list.deleted', { title: collection.title(item, t) }), 'success')
    },
    failed: t('list.deleteFailed'),
    notFoundIsDone: true,
  })

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className={EYEBROW}>{t('nav.content')}</p>
          <PageHeading className="mt-1">{name}</PageHeading>
        </div>
        {collection.creatable ? (
          <AdminLink to={adminPaths.create(collection.id)} className={PRIMARY_BUTTON}>
            <Icon name="plus" />
            {t('list.add')}
          </AdminLink>
        ) : null}
      </div>
      <p className="mt-3 max-w-xl text-sm text-muted">{t(`list.about.${collection.id}`)}</p>

      {items === null ? (
        state.status === 'error' ? (
          <LoadError onRetry={retry} className="mt-6" />
        ) : (
          <LoadingState className="mt-6" />
        )
      ) : (
        <>
          {state.status === 'error' ? <LoadError stale onRetry={retry} className="mt-6" /> : null}
          {items.length === 0 ? (
            <p className="mt-6 border border-line p-6 text-muted">{t('list.empty')}</p>
          ) : (
            // Rows ruled like the site's contact list: a line above each, one below the last.
            <ol role="list" aria-label={name} aria-busy={busy || undefined} className="mt-6 border-b border-line">
              {items.map((item, index) => {
                const title = collection.title(item, t)
                const detail = collection.detail(item, t, i18n.language)
                return (
                  <li key={item.slug} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-4">
                    <div>
                      <p className="font-medium wrap-anywhere">{title}</p>
                      <p className="mt-1 text-sm text-muted wrap-anywhere">
                        {detail ? <span>{detail} · </span> : null}
                        <span className="font-mono text-xs">{item.slug}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {collection.sortable ? (
                        <>
                          <IconButton
                            icon="up"
                            label={t('list.moveUp', { title })}
                            unavailable={index === 0 || busy}
                            onClick={() => void move(index, -1)}
                          />
                          <IconButton
                            icon="down"
                            label={t('list.moveDown', { title })}
                            unavailable={index === items.length - 1 || busy}
                            onClick={() => void move(index, 1)}
                          />
                        </>
                      ) : null}
                      {/* The separating space sits outside the sr-only span, so the name reads "Edit <title>". */}
                      <AdminLink to={adminPaths.edit(collection.id, item.slug)} className={SECONDARY_BUTTON}>
                        {t('list.edit')}{' '}
                        <span className="sr-only">{title}</span>
                      </AdminLink>
                      {collection.creatable ? (
                        // Unavailable while a move or a reload is running: its answer would bring the deleted row back.
                        <button
                          type="button"
                          aria-disabled={busy || undefined}
                          onClick={() => {
                            if (!busy) removal.open(item)
                          }}
                          className={DANGER_BUTTON}
                        >
                          {t('list.delete')}{' '}
                          <span className="sr-only">{title}</span>
                        </button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </>
      )}

      <ConfirmDialog
        {...removal.dialog}
        title={t('list.deleteTitle', { title: removal.target ? collection.title(removal.target, t) : '' })}
        confirmLabel={t('list.deleteConfirm')}
        busyLabel={t('list.deleting')}
        fallbackFocus={pageHeading}
      >
        {t('list.deleteBody')}
      </ConfirmDialog>
    </>
  )
}
