import { useParams } from 'react-router'
import { getCollection } from '../collections'
import { ContentList } from '../content/ContentList'
import { AdminNotFound } from './AdminNotFound'

/** `/admin/content/:collection`; an unknown collection is a not-found page. */
export function ContentListPage() {
  const params = useParams()
  const collection = getCollection(params.collection)
  if (!collection) return <AdminNotFound />
  return <ContentList key={collection.id} collection={collection} />
}
