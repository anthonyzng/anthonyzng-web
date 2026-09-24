import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { isAbortError } from '../../api/client'
import { ThemeToggle } from '../../components/ThemeToggle'
import { fetchSummary, isUnauthorized, logout } from '../api'
import { AdminLink } from '../components/AdminLink'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { useLifetimeSignal } from '../hooks/useLifetimeSignal'
import { ADMIN_NS } from '../i18n'
import { adminPaths } from '../paths'
import type { Summary } from '../schemas'
import { loginState } from '../session/loginState'
import { useSession } from '../session/sessionContext'
import { AdminNav } from './AdminNav'
import { LanguageToggle } from './LanguageToggle'
import { LeaveGuardContext, type LeaveAction, type LeaveGuardValue } from './leaveGuardContext'
import { StatusContext, type StatusContextValue, type StatusTone } from './statusContext'
import { SummaryContext, type SummaryContextValue } from './summaryContext'

interface StatusMessage {
  id: number
  text: string
  tone: StatusTone
  /** The pathname it belongs to; it is shown only there. */
  at: string
}

const STATUS_TONE: Record<StatusTone, string> = {
  info: 'border-line text-muted',
  success: 'border-line text-fg',
  error: 'border-line text-error',
}

/**
 * The signed-in shell: header (site name, language, theme, menu button below md), the navigation
 * (a sidebar from md up, a disclosure below), the page, and three services for the pages: the one
 * polite live region (`useStatus`), the unsaved-changes guard (`useLeaveGuard`) and the summary
 * with the unread count (`useSummary`). No Lenis and no GSAP here: the admin scrolls natively.
 */
export function AdminLayout({ email }: { email: string }) {
  const { t } = useTranslation(ADMIN_NS)
  const { signOut, expire } = useSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Status: one polite live region for every save, move and delete.
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const nextStatusId = useRef(0)
  const currentPath = useRef(pathname)
  useEffect(() => {
    currentPath.current = pathname
  }, [pathname])
  const statusValue = useMemo<StatusContextValue>(
    () => ({
      announce: (text, tone = 'info', options = {}) => {
        nextStatusId.current += 1
        setStatus({ id: nextStatusId.current, text, tone, at: options.at ?? currentPath.current })
      },
    }),
    [],
  )
  // Moving to another page ends a message meant for a different one: coming back later must not
  // show (or announce) it again. A save's message, addressed to the page it navigates to, survives.
  const [statusPath, setStatusPath] = useState(pathname)
  if (statusPath !== pathname) {
    setStatusPath(pathname)
    if (status !== null && status.at !== pathname) setStatus(null)
  }
  const shownStatus = status?.at === pathname ? status : null

  // Unsaved changes: links and sign-out ask first; the navigation runs once the dialog has closed.
  const dirty = useRef(false)
  const discard = useRef<(() => void) | null>(null)
  const [leaveRequest, setLeaveRequest] = useState<{ proceed: LeaveAction } | null>(null)
  // Confirmed, with the page's way to forget its draft as it was then: used only once leaving has worked.
  const confirmedLeave = useRef<{ proceed: LeaveAction; discard: (() => void) | null } | null>(null)
  const guardValue = useMemo<LeaveGuardValue>(
    () => ({
      isDirty: () => dirty.current,
      setDirty: (value, onDiscard) => {
        dirty.current = value
        discard.current = value ? (onDiscard ?? null) : null
      },
      confirmLeave: (proceed) => {
        if (dirty.current) setLeaveRequest({ proceed })
        else void proceed()
      },
    }),
    [],
  )
  const leave = async () => {
    const confirmed = confirmedLeave.current
    confirmedLeave.current = null
    if (confirmed === null) return
    // A sign-out can fail: until leaving has worked, the changes, their kept draft and the guard stay.
    if (!(await confirmed.proceed())) return
    confirmed.discard?.()
    // The page that was left may not have unmounted yet: its guard goes now (a new page's is left alone).
    if (discard.current === confirmed.discard) {
      dirty.current = false
      discard.current = null
    }
  }

  // Summary: loaded once here, again whenever the dashboard opens; concurrent calls share one request,
  // and a forced call made during it (after a change) is followed by one more. Requests end with the
  // layout (its lifetime signal): the session they were made in ends with it, so a late 401 from one
  // of them must not expire the next session, nor a sign-out that just happened.
  const lifetime = useLifetimeSignal()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [summaryStatus, setSummaryStatus] = useState<SummaryContextValue['status']>('loading')
  const [unread, setUnreadCount] = useState<number | null>(null)
  // Bumped by every inbox update: a summary requested before it must not overwrite the newer count.
  const unreadVersion = useRef(0)
  const summaryRequest = useRef<{ signal: AbortSignal } | null>(null)
  const summaryAgain = useRef(false)
  const refresh = useCallback<SummaryContextValue['refresh']>(
    function load({ force = false } = {}) {
      // One running for this layout is joined (StrictMode's rehearsal unmount aborts the first one: not that).
      const running = summaryRequest.current
      if (running !== null && !running.signal.aborted) {
        if (force) summaryAgain.current = true
        return
      }
      // Once the layout is gone its signal is aborted: such a request fails at once, as an abort, and is ignored.
      const request = { signal: lifetime() }
      summaryRequest.current = request
      const version = unreadVersion.current
      setSummaryStatus((current) => (current === 'ready' ? current : 'loading'))
      fetchSummary(request.signal)
        .then(
          (data) => {
            if (request.signal.aborted) return
            setSummary(data)
            if (unreadVersion.current === version) setUnreadCount(data.unreadMessages)
            setSummaryStatus('ready')
          },
          (error: unknown) => {
            if (isAbortError(error) || request.signal.aborted) return
            if (isUnauthorized(error)) expire()
            else setSummaryStatus((current) => (current === 'ready' ? current : 'error'))
          },
        )
        .finally(() => {
          if (summaryRequest.current !== request) return
          summaryRequest.current = null
          if (summaryAgain.current) {
            summaryAgain.current = false
            load()
          }
        })
    },
    [expire, lifetime],
  )
  useEffect(() => refresh(), [refresh])
  const setUnread = useCallback<SummaryContextValue['setUnread']>((update) => {
    unreadVersion.current += 1
    setUnreadCount((current) => (typeof update === 'function' ? (current === null ? null : Math.max(0, update(current))) : update))
  }, [])
  const summaryValue = useMemo<SummaryContextValue>(
    () => ({ summary, status: summaryStatus, unread, setUnread, refresh }),
    [summary, summaryStatus, unread, setUnread, refresh],
  )

  // Below md the navigation is a disclosure; it closes by itself on the next page.
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null)
  const menuOpen = menuOpenAt === pathname
  const mobileNavId = useId()

  const [signingOut, setSigningOut] = useState(false)
  /** True once signed out; false when the server could not be told (the user stays, changes and all). */
  const signOutNow = async (): Promise<boolean> => {
    setSigningOut(true)
    try {
      await logout()
      signOut()
      void navigate(adminPaths.login, { replace: true, state: loginState(null, 'signedOut') })
      return true
    } catch (error) {
      setSigningOut(false)
      if (isUnauthorized(error)) expire()
      else statusValue.announce(t('nav.signOutFailed'), 'error')
      return false
    }
  }
  const requestSignOut = () => guardValue.confirmLeave(signOutNow)

  return (
    <StatusContext.Provider value={statusValue}>
      <LeaveGuardContext.Provider value={guardValue}>
        <SummaryContext.Provider value={summaryValue}>
          <div className="min-h-dvh">
            <a
              href="#admin-main"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
            >
              {t('nav.skip')}
            </a>
            <header className="sticky top-0 z-50 border-b border-line bg-bg">
              <div className="mx-auto flex h-(--header-h) max-w-6xl items-center justify-between gap-2 px-5 sm:px-8">
                <AdminLink
                  to={adminPaths.dashboard}
                  className="inline-flex min-h-11 items-center gap-2 font-mono text-sm font-medium text-fg"
                >
                  <span>
                    anthonyzng<span className="text-accent">.</span>
                  </span>{' '}
                  {/* From md up only: below it the header needs the room for the menu button (320px phones). */}
                  <span className="hidden border border-line px-1.5 py-1 text-xs text-muted md:block">{t('app.badge')}</span>
                </AdminLink>
                <div className="flex items-center gap-1">
                  <LanguageToggle />
                  <ThemeToggle />
                  <button
                    type="button"
                    aria-label={t('nav.menu')}
                    aria-expanded={menuOpen}
                    aria-controls={menuOpen ? mobileNavId : undefined}
                    onClick={() => setMenuOpenAt(menuOpen ? null : pathname)}
                    className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-200 hover:bg-surface hover:text-fg md:hidden"
                  >
                    <Icon name="menu" />
                  </button>
                </div>
              </div>
            </header>

            {/* Below md: the navigation opens under the header. From md up it is the sidebar instead. */}
            {menuOpen ? (
              <nav id={mobileNavId} aria-label={t('nav.label')} className="border-b border-line px-5 py-4 md:hidden">
                <AdminNav email={email} unread={unread} signingOut={signingOut} onLogout={requestSignOut} />
              </nav>
            ) : null}

            <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:px-8 md:grid-cols-12">
              <nav aria-label={t('nav.label')} className="hidden pt-8 md:col-span-3 md:block">
                <AdminNav email={email} unread={unread} signingOut={signingOut} onLogout={requestSignOut} />
              </nav>

              <main id="admin-main" className="pt-8 pb-14 md:col-span-9">
                <div role="status" aria-live="polite">
                  {shownStatus ? (
                    <p key={shownStatus.id} className={`border bg-surface px-5 py-3 text-sm ${STATUS_TONE[shownStatus.tone]}`}>
                      {shownStatus.text}
                    </p>
                  ) : null}
                </div>
                <div className={shownStatus ? 'mt-6' : undefined}>
                  <Outlet />
                </div>
              </main>
            </div>
          </div>

          <ConfirmDialog
            open={leaveRequest !== null}
            title={t('leave.title')}
            confirmLabel={t('leave.confirm')}
            onConfirm={() => {
              // The user chose to drop the changes; nothing is dropped yet (see `leave`).
              confirmedLeave.current = leaveRequest ? { proceed: leaveRequest.proceed, discard: discard.current } : null
              setLeaveRequest(null)
            }}
            onCancel={() => setLeaveRequest(null)}
            onClosed={() => void leave()}
          >
            {t('leave.body')}
          </ConfirmDialog>
        </SummaryContext.Provider>
      </LeaveGuardContext.Provider>
    </StatusContext.Provider>
  )
}
