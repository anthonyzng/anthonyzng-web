import { createContext, useContext } from 'react'

export type StatusTone = 'info' | 'success' | 'error'

export interface AnnounceOptions {
  /**
   * The page the message belongs to (default: the current one). A save announces its result for
   * the list it navigates to; the message disappears once the user moves on to another page.
   */
  at?: string
}

export interface StatusContextValue {
  /** Shows `text` in the admin panel's one polite live region. */
  announce(text: string, tone?: StatusTone, options?: AnnounceOptions): void
}

const silent: StatusContextValue = { announce: () => {} }

export const StatusContext = createContext<StatusContextValue>(silent)

export const useStatus = (): StatusContextValue => useContext(StatusContext)
