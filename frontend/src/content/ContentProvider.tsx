import type { ReactNode } from 'react'
import { ContentContext } from './contentContext'
import { useContent } from './useContent'

/**
 * Loads the site content once for the page below it (see `useContent`) and shares it, so the four
 * content sections render from one snapshot and the API is asked once per locale, not once per section.
 */
export function ContentProvider({ children }: { children: ReactNode }) {
  const content = useContent()
  return <ContentContext value={content}>{children}</ContentContext>
}
