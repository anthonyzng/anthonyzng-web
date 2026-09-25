import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiHttpError, isAbortError } from '../../api/client'
import { isUnauthorized, type TotpConfirmation } from '../api'
import { TextControl } from '../components/TextControl'
import { ADMIN_NS } from '../i18n'
import { retryText } from '../retryText'
import type { TotpStatus } from '../schemas'
import { useSession } from '../session/sessionContext'
import { DANGER_BUTTON, PRIMARY_BUTTON } from '../styles'
import { codeError, normalizeCode } from '../totpCode'

type Field = 'password' | 'code'
/** Keys under `security.errors`, per field. */
type Errors = Partial<Record<Field, string>>

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'invalid' }
  | { kind: 'rateLimited'; retryAfter: number | null }
  | { kind: 'unavailable' }
  | { kind: 'error' }

interface TotpConfirmFormProps {
  /** `enable` confirms a code from the new secret; `disable` a code from the one in use. */
  action: 'enable' | 'disable'
  submit(confirmation: TotpConfirmation, signal: AbortSignal): Promise<TotpStatus>
  onDone(status: TotpStatus): void
  /** 409: two-factor sign-in changed elsewhere (another tab); the page loads the current state. */
  onConflict(): void
}

/**
 * The password again and a current authenticator code: what turning two-factor sign-in on or off
 * asks for. A wrong password or code marks its field and empties it; a 401 ends the session;
 * a 429 says when to try again.
 */
export function TotpConfirmForm({ action, submit, onDone, onConflict }: TotpConfirmFormProps) {
  const { t } = useTranslation(ADMIN_NS)
  const { expire } = useSession()
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const request = useRef<AbortController | null>(null)
  const [values, setValues] = useState<Record<Field, string>>({ password: '', code: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [focusRequest, setFocusRequest] = useState(0)
  const statusId = `${id}-status`

  useEffect(() => () => request.current?.abort(), [])

  useEffect(() => {
    if (focusRequest > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusRequest])

  const validate = (field: Field, value: string): string | null =>
    field === 'password' ? (value === '' ? 'passwordRequired' : null) : codeError(value)

  const change = (field: Field) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: validate(field, value) ?? undefined }))
  }

  const flag = (found: Errors, cleared: Partial<Record<Field, string>> = {}) => {
    setValues((current) => ({ ...current, ...cleared }))
    setErrors(found)
    setStatus({ kind: 'invalid' })
    setFocusRequest((current) => current + 1)
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status.kind === 'submitting') return
    const found: Errors = {}
    for (const field of ['password', 'code'] as const) {
      const key = validate(field, values[field])
      if (key) found[field] = key
    }
    if (Object.keys(found).length > 0) {
      flag(found)
      return
    }
    setErrors({})
    setStatus({ kind: 'submitting' })
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await submit({ password: values.password, code: normalizeCode(values.code) }, controller.signal)
      setStatus({ kind: 'idle' })
      onDone(result)
    } catch (caught) {
      if (isAbortError(caught)) return
      if (isUnauthorized(caught)) {
        expire()
      } else if (caught instanceof ApiHttpError && caught.status === 400 && caught.code === 'wrong_password') {
        flag({ password: 'wrongPassword' }, { password: '' })
      } else if (caught instanceof ApiHttpError && caught.status === 400 && caught.code === 'totp_invalid') {
        flag({ code: 'codeWrong' }, { code: '' })
      } else if (caught instanceof ApiHttpError && caught.status === 422) {
        const fields = caught.fields ?? {}
        const fromServer: Errors = {}
        if (Object.hasOwn(fields, 'password')) fromServer.password = 'passwordRequired'
        if (Object.hasOwn(fields, 'code')) fromServer.code = 'codeFormat'
        if (Object.keys(fromServer).length > 0) flag(fromServer)
        else setStatus({ kind: 'error' })
      } else if (caught instanceof ApiHttpError && caught.status === 409) {
        setStatus({ kind: 'idle' })
        onConflict()
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
  const errorText = (field: Field) => (errors[field] ? t(`security.errors.${errors[field]}`) : null)
  const [label, busyLabel] = action === 'enable' ? [t('security.enable'), t('security.enabling')] : [t('security.disable'), t('security.disabling')]

  return (
    <>
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        aria-describedby={statusId}
        aria-busy={submitting}
        className="flex max-w-md flex-col gap-5"
      >
        <TextControl
          id={`${id}-password`}
          control="password"
          label={t('security.password')}
          value={values.password}
          onChange={change('password')}
          error={errorText('password')}
          autoComplete="current-password"
          required
        />
        <TextControl
          id={`${id}-code`}
          control="otp"
          label={t('security.code')}
          hint={t('security.codeHint')}
          value={values.code}
          onChange={change('code')}
          error={errorText('code')}
          autoComplete="one-time-code"
          code
          required
        />
        <button
          type="submit"
          aria-disabled={submitting || undefined}
          className={`${action === 'enable' ? PRIMARY_BUTTON : DANGER_BUTTON} w-fit`}
        >
          {submitting ? busyLabel : label}
        </button>
      </form>
      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={`mt-4 text-sm text-pretty empty:mt-0 ${failed ? 'text-error' : 'text-muted'}`}
      >
        {statusText(status, busyLabel, t)}
      </p>
    </>
  )
}

function statusText(status: Status, busyLabel: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (status.kind) {
    case 'idle':
      return ''
    case 'submitting':
      return busyLabel
    case 'invalid':
      return t('login.errors.fixFields')
    case 'rateLimited':
      return retryText(status.retryAfter, t)
    case 'unavailable':
      return t('security.errors.unavailable')
    case 'error':
      return t('security.errors.generic')
  }
}
