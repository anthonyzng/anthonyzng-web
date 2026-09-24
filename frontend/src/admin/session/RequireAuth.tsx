import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router'
import { isAbortError } from '../../api/client'
import { fetchMe, isUnauthorized } from '../api'
import { pageHeading } from '../dom'
import { ADMIN_NS } from '../i18n'
import { adminPaths } from '../paths'
import { AdminLayout } from '../shell/AdminLayout'
import { SECONDARY_BUTTON } from '../styles'
import { loginState } from './loginState'
import { useSession } from './sessionContext'

type Entry = 'checking' | 'ok' | 'anonymous' | 'failed'

/**
 * The gate in front of every admin page but the login page. On entry it asks `GET /auth/me` once
 * (skipped right after a sign-in, which already proved the session); a 401 goes to the login page
 * with the way back, and a 401 from any later admin call (session `expired`) does the same with a
 * "session expired" notice. Moving between admin pages keeps this component mounted: no re-check.
 * A check the server did not answer offers a retry; the failure is an alert (each time), the
 * retry keeps focus on this screen, and once it works focus goes to the page that opens.
 */
export function RequireAuth() {
  const { t } = useTranslation(ADMIN_NS)
  const { session, signIn } = useSession()
  const location = useLocation()
  const [entry, setEntry] = useState<Entry>(() => (session.status === 'signedIn' ? 'ok' : 'checking'))
  const gate = useRef<HTMLElement>(null)
  const retried = useRef(false)

  useEffect(() => {
    if (entry !== 'checking') return
    const controller = new AbortController()
    fetchMe(controller.signal).then(
      ({ email }) => {
        signIn(email)
        setEntry('ok')
      },
      (error: unknown) => {
        if (isAbortError(error)) return
        setEntry(isUnauthorized(error) ? 'anonymous' : 'failed')
      },
    )
    return () => controller.abort()
  }, [entry, signIn])

  // A retry that worked replaced this screen with the panel: its page heading takes focus, which
  // also tells a screen-reader user that it worked (the page's own effects ran first).
  useEffect(() => {
    if (entry !== 'ok' || !retried.current) return
    retried.current = false
    pageHeading()?.focus()
  }, [entry])

  if (session.status === 'expired') {
    return <Navigate to={adminPaths.login} replace state={loginState(location, 'expired')} />
  }
  if (entry === 'anonymous') return <Navigate to={adminPaths.login} replace state={loginState(location)} />
  if (entry === 'ok' && session.status === 'signedIn') return <AdminLayout email={session.email} />

  // The screen itself takes focus on a retry: the button goes away while the check runs again. The
  // keys keep the two paragraphs apart, so each failure puts a new alert in (announced again)
  // instead of React reusing the "Loading…" paragraph for it.
  return (
    <main ref={gate} tabIndex={-1} className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 px-5">
      {entry === 'failed' ? (
        <>
          <p key="failed" role="alert" className="text-error">
            {t('common.sessionCheckFailed')}
          </p>
          <button
            key="retry"
            type="button"
            onClick={() => {
              gate.current?.focus()
              retried.current = true
              setEntry('checking')
            }}
            className={SECONDARY_BUTTON}
          >
            {t('common.retry')}
          </button>
        </>
      ) : (
        <p key="checking" className="text-muted">
          {t('common.loading')}
        </p>
      )}
    </main>
  )
}
