import { useParams } from 'react-router'
import { getCollection } from '../collections'
import { EditorLoader } from '../editor/EditorLoader'
import { AdminNotFound } from './AdminNotFound'

/**
 * `/admin/content/:collection/new` and `/admin/content/:collection/:slug`. An unknown collection,
 * or "new" in a collection with a fixed set of rows (site texts), is a not-found page.
 */
export function ContentEditorPage({ mode }: { mode: 'create' | 'edit' }) {
  const params = useParams()
  const collection = getCollection(params.collection)
  if (!collection || (mode === 'create' && !collection.creatable)) return <AdminNotFound />
  const slug = mode === 'edit' ? (params.slug ?? '') : null
  return <EditorLoader key={`${collection.id}/${slug ?? ''}`} collection={collection} slug={slug} />
}
