import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { ThemeToggle } from '../../components/ThemeToggle'
import { TurnstileWidget } from '../../components/TurnstileWidget'
import { useTurnstile } from '../../components/useTurnstile'
import { ApiHttpError, isAbortError } from '../../api/client'
import { login } from '../api'
import { PageHeading } from '../components/PageHeading'
import { TextControl } from '../components/TextControl'
import { LoginCodeStep } from './LoginCodeStep'
import { usePageTitle } from '../hooks/usePageTitle'
import { ADMIN_NS } from '../i18n'
import { retryText } from '../retryText'
import { readLoginState } from '../session/loginState'
import { useSession } from '../session/sessionContext'
import { LanguageToggle } from '../shell/LanguageToggle'
import { CARD, PRIMARY_BUTTON } from '../styles'

type Field = 'email' | 'password'
type Values = Record<Field, string>
/** Keys under `login.errors`, per field; `turnstile` is the verification widget. */
type Errors = Partial<Record<Field | 'turnstile', string>>

type Status =
  | { kind: 'idle' }
  | { kind: 'invalid' }
  | { kind: 'submitting' }
  | { kind: 'wrongCredentials' }
  | { kind: 'rateLimited'; retryAfter: number | null }
  | { kind: 'verificationFailed' }
  | { kind: 'unavailable' }
  | { kind: 'codeExpired' }
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
 * Sign-in for the single admin account, behind a Cloudflare Turnstile check. Inline validation; the
 * form is not sent until the widget has issued a token; a 401 is one generic message for both
 * fields (the backend answers unknown email and wrong password identically); a 429 says when to
 * try again; a rejected check (400) or an unreachable verification service (503) asks for another
 * try. A token is single-use, so every failed attempt resets the widget. With two-factor sign-in on,
 * a right password leads to the code step (`LoginCodeStep`) instead of a session; leaving it, or its
 * pending sign-in running out, returns here with a new challenge. On success the user returns to the
 * admin page that sent them here.
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
  const [awaitingCode, setAwaitingCode] = useState(false)
  /** Bumped when the code step hands back: the password field is where to continue. */
  const [passwordFocus, setPasswordFocus] = useState(0)
  const turnstile = useTurnstile()
  usePageTitle(t('login.title'))

  useEffect(() => () => request.current?.abort(), [])

  useEffect(() => {
    if (focusRequest > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusRequest])

  useEffect(() => {
    if (passwordFocus > 0) document.getElementById(`${id}-password`)?.focus()
  }, [passwordFocus, id])

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
    const token = turnstile.token
    if (token === null) found.turnstile = 'turnstileRequired'
    setErrors(found)
    if (token === null || Object.keys(found).length > 0) {
      setStatus({ kind: 'invalid' })
      setFocusRequest((current) => current + 1)
      return
    }

    setStatus({ kind: 'submitting' })
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await login(
        { email: values.email.trim(), password: values.password, turnstileToken: token },
        controller.signal,
      )
      if (result.totpRequired) {
        // The token is spent; the widget unmounts with this form and issues a new one if it returns.
        turnstile.clear()
        setValues((current) => ({ ...current, password: '' }))
        setStatus({ kind: 'idle' })
        setAwaitingCode(true)
        return
      }
      signIn(result.email)
      void navigate(from, { replace: true })
    } catch (error) {
      if (isAbortError(error)) return
      if (error instanceof ApiHttpError && error.status === 422 && error.fields) {
        const fromServer: Errors = {}
        if (Object.hasOwn(error.fields, 'email')) fromServer.email = 'emailInvalid'
        if (Object.hasOwn(error.fields, 'password')) fromServer.password = 'passwordRequired'
        const tokenRefused = Object.hasOwn(error.fields, 'turnstileToken')
        if (tokenRefused) fromServer.turnstile = 'turnstileRequired'
        setErrors(fromServer)
        setStatus(Object.keys(fromServer).length > 0 ? { kind: 'invalid' } : { kind: 'error' })
        setFocusRequest((current) => current + 1)
        // The body was refused before the token was checked, so the widget keeps it, unless the token
        // itself was refused. Reset last: the new token then withdraws the message set just above.
        if (tokenRefused) turnstile.reset()
        return
      }
      // Any other failure may have spent the token (it is single-use): the next attempt needs a new one.
      turnstile.reset()
      if (error instanceof ApiHttpError && error.status === 401) {
        setValues((current) => ({ ...current, password: '' }))
        setStatus({ kind: 'wrongCredentials' })
      } else if (error instanceof ApiHttpError && error.status === 429) {
        setStatus({ kind: 'rateLimited', retryAfter: error.retryAfter })
      } else if (error instanceof ApiHttpError && error.status === 400 && error.code === 'turnstile_failed') {
        setStatus({ kind: 'verificationFailed' })
      } else if (error instanceof ApiHttpError && error.status === 503) {
        setStatus({ kind: 'unavailable' })
      } else {
        setStatus({ kind: 'error' })
      }
    } finally {
      if (request.current === controller) request.current = null
    }
  }

  const submitting = status.kind === 'submitting'
  // "Check the highlighted fields" lives exactly as long as something is highlighted.
  const flagged = (Object.keys(errors) as (keyof Errors)[]).filter((key) => errors[key])
  const shown: Status = status.kind === 'invalid' && flagged.length === 0 ? { kind: 'idle' } : status
  const failed = shown.kind !== 'idle' && shown.kind !== 'submitting'
  // Only the check is missing: the status line says so instead of pointing at fields that are fine.
  const onlyCheckMissing = flagged.length === 1 && flagged[0] === 'turnstile'
  const statusId = `${id}-status`
  const turnstileErrorId = `${id}-turnstile-error`
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
          <PageHeading describedBy={notice && !awaitingCode ? noticeId : undefined}>{t('login.title')}</PageHeading>
          {awaitingCode ? (
            <LoginCodeStep
              onSignedIn={(email) => {
                signIn(email)
                void navigate(from, { replace: true })
              }}
              onRestart={(expired) => {
                setAwaitingCode(false)
                setStatus(expired ? { kind: 'codeExpired' } : { kind: 'idle' })
                setPasswordFocus((current) => current + 1)
              }}
            />
          ) : (
            <>
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
                <TurnstileWidget
                  binding={turnstile.widget}
                  // A fresh token answers a "complete the verification check" left by an early submit.
                  onToken={() => setErrors((current) => ({ ...current, turnstile: undefined }))}
                  error={errors.turnstile ? t(`login.errors.${errors.turnstile}`) : null}
                  errorId={turnstileErrorId}
                />
                {/* The widget is an iframe with no field to mark, so the button names its message instead. */}
                <button
                  type="submit"
                  aria-disabled={submitting || undefined}
                  aria-describedby={errors.turnstile ? turnstileErrorId : undefined}
                  className={`${PRIMARY_BUTTON} w-full`}
                >
                  {submitting ? t('login.submitting') : t('login.submit')}
                </button>
              </form>

              <p
                id={statusId}
                role="status"
                aria-live="polite"
                className={`mt-5 text-sm text-pretty empty:mt-0 ${failed ? 'text-error' : 'text-muted'}`}
              >
                {statusText(shown, onlyCheckMissing, t)}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function statusText(
  status: Status,
  onlyCheckMissing: boolean,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (status.kind) {
    case 'idle':
      return ''
    case 'invalid':
      return onlyCheckMissing ? t('login.errors.completeCheck') : t('login.errors.fixFields')
    case 'submitting':
      return t('login.submitting')
    case 'wrongCredentials':
      return t('login.errors.wrongCredentials')
    case 'rateLimited':
      return retryText(status.retryAfter, t)
    case 'verificationFailed':
      return t('login.errors.turnstileFailed')
    case 'unavailable':
      return t('login.errors.unavailable')
    case 'codeExpired':
      return t('login.codeExpired')
    case 'error':
      return t('login.errors.generic')
  }
}
