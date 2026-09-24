import { createContext, useContext } from 'react'

/**
 * Where the admin session stands in this visit. `unknown` until the guard has asked `/auth/me`;
 * `expired` once an admin call answered 401 (the guard then sends the user to the login page with
 * a "session expired" notice and a way back).
 */
export type Session =
  | { status: 'unknown' }
  | { status: 'signedIn'; email: string }
  | { status: 'signedOut' }
  | { status: 'expired' }

export interface SessionContextValue {
  session: Session
  signIn(email: string): void
  signOut(): void
  /** An admin call answered 401. */
  expire(): void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (value === null) throw new Error('useSession() must be used inside <AdminSessionProvider>.')
  return value
}
