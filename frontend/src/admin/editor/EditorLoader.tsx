import { useTranslation } from 'react-i18next'
import { listItems } from '../api'
import type { Collection } from '../collections'
import { AdminLink } from '../components/AdminLink'
import { LoadError } from '../components/LoadError'
import { LoadingState } from '../components/LoadingState'
import { PageHeading } from '../components/PageHeading'
import { formatDateTime } from '../format'
import { useAdminQuery } from '../hooks/useAdminQuery'
import { usePageTitle } from '../hooks/usePageTitle'
import { ADMIN_NS } from '../i18n'
import { adminPaths } from '../paths'
import { TEXT_LINK } from '../styles'
import { ContentEditorForm } from './ContentEditorForm'

interface EditorLoaderProps {
  collection: Collection
  /** The row being edited, or null for a new one. */
  slug: string | null
}

/**
 * Loads the collection (the API has no single-row read, and a new row needs the list anyway for
 * slug uniqueness), then hands the row to the form. The row follows every newer version the form
 * gets from the server (a save it stays on, the latest version after a conflict), so the heading,
 * the "last saved" line and the form's If-Match all move with it; an image change replaces only
 * the image. The heading is on screen from the start, so a keyboard user lands on it while the
 * data loads.
 */
export function EditorLoader({ collection, slug }: EditorLoaderProps) {
  const { t, i18n } = useTranslation(ADMIN_NS)
  const { state, retry, setData } = useAdminQuery(`content:${collection.id}`, (signal) => listItems(collection, signal))
  const collectionName = t(`collections.${collection.id}`)
  const items = state.status === 'ready' ? state.data : null
  const item = slug === null || items === null ? null : (items.find((row) => row.slug === slug) ?? null)
  const missing = slug !== null && items !== null && item === null

  let heading: string
  if (slug === null) heading = t('editor.createTitle', { collection: collectionName })
  else if (missing) heading = t('editor.missingTitle')
  else if (item) heading = t('editor.editTitle', { title: collection.title(item, t) })
  else heading = t('editor.editLoading')
  usePageTitle(heading)

  return (
    <>
      <AdminLink to={adminPaths.collection(collection.id)} className={`inline-flex min-h-11 items-center text-sm ${TEXT_LINK}`}>
        <span aria-hidden="true">←&nbsp;</span>
        {t('editor.back', { collection: collectionName })}
      </AdminLink>
      <PageHeading className="mt-2">{heading}</PageHeading>
      {item ? (
        <p className="mt-2 text-sm text-muted">
          {t('editor.updatedAt', { date: formatDateTime(item.updatedAt, i18n.language) })}
        </p>
      ) : null}

      {items === null ? (
        state.status === 'error' ? (
          <LoadError onRetry={retry} className="mt-8" />
        ) : (
          <LoadingState className="mt-8" />
        )
      ) : missing ? (
        <p className="mt-4 text-muted">{t('editor.missingBody', { slug })}</p>
      ) : (
        <ContentEditorForm
          collection={collection}
          item={item}
          items={items}
          onRowChange={(row) => setData((rows) => rows.map((entry) => (entry.slug === row.slug ? row : entry)))}
          onImageChange={(image) =>
            setData((rows) => rows.map((entry) => (entry.slug === slug && 'image' in entry ? { ...entry, image } : entry)))
          }
        />
      )}
    </>
  )
}
