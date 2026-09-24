import { createContext, use } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveLanguage } from '../i18n/languages'
import type { ResolvedContent } from './resolved'
import { staticContent } from './staticContent'

/** Provided by `ContentProvider` (one fetch per page); `null` outside it. */
export const ContentContext = createContext<ResolvedContent | null>(null)

/**
 * The resolved content a section renders. Inside `ContentProvider` this is the shared value
 * (static first, then the API). Outside it (a component rendered on its own, in a test) it is the
 * static snapshot for the active locale, so a section never needs a provider just to render.
 */
export function useResolvedContent(): ResolvedContent {
  const provided = use(ContentContext)
  const { i18n } = useTranslation()
  return provided ?? staticContent(resolveLanguage(i18n.language))
}
