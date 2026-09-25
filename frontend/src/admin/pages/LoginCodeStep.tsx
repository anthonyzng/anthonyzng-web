import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiHttpError, isAbortError } from '../../api/client'
import { loginWithCode } from '../api'
import { TextControl } from '../components/TextControl'
import { ADMIN_NS } from '../i18n'
import { retryText } from '../retryText'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../styles'
import { codeError, normalizeCode } from '../totpCode'

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'invalid' }
  | { kind: 'wrongCode' }
  | { kind: 'rateLimited'; retryAfter: number | null }
  | { kind: 'unavailable' }
  | { kind: 'error' }

interface LoginCodeStepProps {
  onSignedIn(email: string): void
  /** Back to the password step: `expired` when the pending sign-in ran out (5 minutes) or was revoked. */
  onRestart(expired: boolean): void
}

/**
 * The second step of a sign-in with two-factor sign-in on: the password was right, and the
 * server holds a pending sign-in (an httpOnly cookie, 5 minutes) until a current authenticator
 * code arrives. The field takes focus when the step appears. A wrong code clears the field and
 * keeps the step; a 401 means the pending sign-in is gone, so the password step returns; a 429
 * says when to try again.
 */
export function LoginCodeStep({ onSignedIn, onRestart }: LoginCodeStepProps) {
  const { t } = useTranslation(ADMIN_NS)
  const id = useId()
  const request = useRef<AbortController | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [focusRequest, setFocusRequest] = useState(1)
  const fieldId = `${id}-code`
  const statusId = `${id}-status`

  useEffect(() => () => request.current?.abort(), [])

  useEffect(() => {
    if (focusRequest > 0) document.getElementById(fieldId)?.focus()
  }, [focusRequest, fieldId])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status.kind === 'submitting') return
    const problem = codeError(code)
    if (problem) {
      setError(problem)
      setStatus({ kind: 'invalid' })
      setFocusRequest((current) => current + 1)
      return
    }
    setError(null)
    setStatus({ kind: 'submitting' })
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await loginWithCode(normalizeCode(code), controller.signal)
      onSignedIn(result.email)
    } catch (caught) {
      if (isAbortError(caught)) return
      if (caught instanceof ApiHttpError && caught.status === 401) {
        onRestart(true)
        return
      }
      if (caught instanceof ApiHttpError && caught.status === 400 && caught.code === 'totp_invalid') {
        setCode('')
        setError('codeWrong')
        setStatus({ kind: 'wrongCode' })
        setFocusRequest((current) => current + 1)
      } else if (caught instanceof ApiHttpError && caught.status === 422) {
        setError('codeFormat')
        setStatus({ kind: 'invalid' })
        setFocusRequest((current) => current + 1)
      } else if (caught instanceof ApiHttpError && caught.status === 429) {
        setStatus({ kind: 'rateLimited', retryAfter: caught.retryAfter })
      } else if (caught instanceof ApiHttpError && caught.status === 503) {
        setStatus({ kind: 'unavailable' })
      } else {
        setStatus({ kind: 'error' })
      }
    } finally {
      if (request.current === controller) request.current = null
    }
  }

  const submitting = status.kind === 'submitting'
  const failed = status.kind !== 'idle' && status.kind !== 'submitting'

  return (
    <>
      <p className="mt-2 text-sm text-muted">{t('login.codeIntro')}</p>
      <form
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        aria-describedby={statusId}
        aria-busy={submitting}
        className="mt-6 flex flex-col gap-5"
      >
        <TextControl
          id={fieldId}
          control="otp"
          label={t('login.code')}
          hint={t('login.codeHint')}
          value={code}
          onChange={(value) => {
            setCode(value)
            if (error) setError(codeError(value))
          }}
          error={error ? t(`login.errors.${error}`) : null}
          autoComplete="one-time-code"
          code
          required
        />
        <button type="submit" aria-disabled={submitting || undefined} className={`${PRIMARY_BUTTON} w-full`}>
          {submitting ? t('login.verifying') : t('login.verify')}
        </button>
        <button
          type="button"
          onClick={() => {
            request.current?.abort()
            onRestart(false)
          }}
          className={`${SECONDARY_BUTTON} w-full`}
        >
          {t('login.startOver')}
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
    </>
  )
}

function statusText(status: Status, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (status.kind) {
    case 'idle':
      return ''
    case 'submitting':
      return t('login.verifying')
    case 'invalid':
      return t('login.errors.fixFields')
    case 'wrongCode':
      return t('login.errors.codeWrong')
    case 'rateLimited':
      return retryText(status.retryAfter, t)
    case 'unavailable':
      return t('login.errors.codeUnavailable')
    case 'error':
      return t('login.errors.generic')
  }
}
