import { createContext, useContext } from 'react'
import type { Summary } from '../schemas'

export interface SummaryContextValue {
  /** The latest `GET /admin/summary`, or null before the first answer. */
  summary: Summary | null
  status: 'loading' | 'ready' | 'error'
  /** Unread messages for the navigation badge: from the summary, then kept current by the inbox. */
  unread: number | null
  setUnread(update: number | ((current: number) => number)): void
  /**
   * Fetches the summary again. A call while one is in flight joins it, unless `force` (the caller has
   * just changed something the answer in flight may predate): then another fetch follows it.
   */
  refresh(options?: { force?: boolean }): void
}

export const SummaryContext = createContext<SummaryContextValue | null>(null)

export function useSummary(): SummaryContextValue {
  const value = useContext(SummaryContext)
  if (value === null) throw new Error('useSummary() must be used inside <AdminLayout>.')
  return value
}
