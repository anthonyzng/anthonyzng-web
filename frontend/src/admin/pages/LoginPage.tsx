import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { ThemeToggle } from '../../components/ThemeToggle'
import { ApiHttpError, isAbortError } from '../../api/client'
import { login } from '../api'
import { PageHeading } from '../components/PageHeading'
import { TextControl } from '../components/TextControl'
import { usePageTitle } from '../hooks/usePageTitle'
import { ADMIN_NS } from '../i18n'
import { readLoginState } from '../session/loginState'
import { useSession } from '../session/sessionContext'
import { LanguageToggle } from '../shell/LanguageToggle'
import { CARD, PRIMARY_BUTTON } from '../styles'

type Field = 'email' | 'password'
type Values = Record<Field, string>
type Errors = Partial<Record<Field, string>>

type Status =
  | { kind: 'idle' }
  | { kind: 'invalid' }
  | { kind: 'submitting' }
  | { kind: 'wrongCredentials' }
  | { kind: 'rateLimited'; retryAfter: number | null }
  | { kind: 'error' }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Keys under `login.errors`; the same limits as the backend's LoginRequest. */
function validate(field: Field, value: string): string | null {
  if (field === 'email') {
    const trimmed = value.trim()
    if (trimmed === '') return 'emailRequired'
    if (trimmed.length > 254 || !EMAIL.test(trimmed)) return 'emailInvalid'
    return null
  }
  return value === '' ? 'passwordRequired' : null
}

/**
 * Sign-in for the single admin account. Inline validation; a 401 is one generic message for both
 * fields (the backend answers unknown email and wrong password identically); a 429 says when to
 * try again. On success the user returns to the admin page that sent them here.
 */
export function LoginPage() {
  const { t } = useTranslation(ADMIN_NS)
  const { session, signIn } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const { from, reason } = readLoginState(location.state)
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const request = useRef<AbortController | null>(null)
  const [values, setValues] = useState<Values>({ email: '', password: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [attempted, setAttempted] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [focusRequest, setFocusRequest] = useState(0)
  usePageTitle(t('login.title'))

  useEffect(() => () => request.current?.abort(), [])

  useEffect(() => {
    if (focusRequest > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusRequest])

  if (session.status === 'signedIn' && status.kind !== 'submitting') return <Navigate to={from} replace />

  const change = (field: Field) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: validate(field, value) ?? undefined }))
  }

  const blur = (field: Field) => () => {
    if (attempted || values[field] !== '') setErrors((current) => ({ ...current, [field]: validate(field, values[field]) ?? undefined }))
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status.kind === 'submitting') return
    setAttempted(true)
    const found: Errors = {}
    for (const field of ['email', 'password'] as const) {
      const key = validate(field, values[field])
      if (key) found[field] = key
    }
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setStatus({ kind: 'invalid' })
      setFocusRequest((current) => current + 1)
      return
    }

    setStatus({ kind: 'submitting' })
    const controller = new AbortController()
    request.current = controller
    try {
      const admin = await login(values.email.trim(), values.password, controller.signal)
      signIn(admin.email)
      void navigate(from, { replace: true })
    } catch (error) {
      if (isAbortError(error)) return
      if (error instanceof ApiHttpError && error.status === 401) {
        setValues((current) => ({ ...current, password: '' }))
        setStatus({ kind: 'wrongCredentials' })
      } else if (error instanceof ApiHttpError && error.status === 429) {
        setStatus({ kind: 'rateLimited', retryAfter: error.retryAfter })
      } else if (error instanceof ApiHttpError && error.status === 422 && error.fields) {
        const fromServer: Errors = {}
        if (Object.hasOwn(error.fields, 'email')) fromServer.email = 'emailInvalid'
        if (Object.hasOwn(error.fields, 'password')) fromServer.password = 'passwordRequired'
        setErrors(fromServer)
        setStatus(Object.keys(fromServer).length > 0 ? { kind: 'invalid' } : { kind: 'error' })
        setFocusRequest((current) => current + 1)
      } else {
        setStatus({ kind: 'error' })
      }
    } finally {
      if (request.current === controller) request.current = null
    }
  }

  const submitting = status.kind === 'submitting'
  const failed = status.kind !== 'idle' && status.kind !== 'submitting'
  const statusId = `${id}-status`
  const noticeId = `${id}-notice`
  // Why the user is here; read with the heading, which takes focus after the redirect.
  const notice = reason === 'expired' ? t('login.expired') : reason === 'signedOut' ? t('login.signedOut') : null
  const errorText = (field: Field) => (errors[field] ? t(`login.errors.${errors[field]}`) : null)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-(--header-h) max-w-6xl items-center justify-between gap-2 px-5 sm:px-8">
          <p className="inline-flex items-center gap-2 font-mono text-sm font-medium">
            <span>
              anthonyzng<span className="text-accent">.</span>
            </span>{' '}
            <span className="border border-line px-1.5 py-1 text-xs text-muted">{t('app.badge')}</span>
          </p>
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 py-8 md:py-16">
        <div className={`w-full max-w-xl p-6 ${CARD}`}>
          <PageHeading describedBy={notice ? noticeId : undefined}>{t('login.title')}</PageHeading>
          <p className="mt-2 text-sm text-muted">{t('login.intro')}</p>
          {notice ? (
            <p id={noticeId} className="mt-4 border border-line bg-bg px-3 py-3 text-sm text-fg">
              {notice}
            </p>
          ) : null}

          <form
            ref={formRef}
            noValidate
            onSubmit={(event) => void onSubmit(event)}
            aria-describedby={statusId}
            aria-busy={submitting}
            className="mt-6 flex flex-col gap-5"
          >
            <TextControl
              id={`${id}-email`}
              control="email"
              label={t('login.email')}
              value={values.email}
              onChange={change('email')}
              onBlur={blur('email')}
              error={errorText('email')}
              autoComplete="username"
              required
            />
            <TextControl
              id={`${id}-password`}
              control="password"
              label={t('login.password')}
              value={values.password}
              onChange={change('password')}
              onBlur={blur('password')}
              error={errorText('password')}
              autoComplete="current-password"
              required
            />
            <button type="submit" aria-disabled={submitting || undefined} className={`${PRIMARY_BUTTON} w-full`}>
              {submitting ? t('login.submitting') : t('login.submit')}
            </button>
          </form>

          <p
            id={statusId}
            role="status"
            aria-live="polite"
            className={`mt-5 text-sm text-pretty empty:mt-0 ${failed ? 'text-error' : 'text-muted'}`}
          >
            {statusText(status, t)}
          </p>
        </div>
      </main>
    </div>
  )
}

function statusText(status: Status, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (status.kind) {
    case 'idle':
      return ''
    case 'invalid':
      return t('login.errors.fixFields')
    case 'submitting':
      return t('login.submitting')
    case 'wrongCredentials':
      return t('login.errors.wrongCredentials')
    case 'rateLimited':
      return status.retryAfter === null
        ? t('login.errors.rateLimited')
        : t('login.errors.rateLimitedIn', { count: Math.max(1, Math.ceil(status.retryAfter / 60)) })
    case 'error':
      return t('login.errors.generic')
  }
}
