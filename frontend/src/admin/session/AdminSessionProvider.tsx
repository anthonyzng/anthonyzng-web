import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { SessionContext, type Session } from './sessionContext'

/** Holds the session for as long as the admin panel is mounted; nothing is persisted (the cookie is the session). */
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'unknown' })

  const signIn = useCallback((email: string) => setSession({ status: 'signedIn', email }), [])
  const signOut = useCallback(() => setSession({ status: 'signedOut' }), [])
  // Several requests can fail together; the first 401 decides, the rest change nothing.
  const expire = useCallback(() => setSession((current) => (current.status === 'expired' ? current : { status: 'expired' })), [])

  const value = useMemo(() => ({ session, signIn, signOut, expire }), [session, signIn, signOut, expire])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
