import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useEffect, useId, useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiHttpError, isAbortError } from '../api/client'
import { submitContact } from '../api/contact'
import { TURNSTILE_SITE_KEY } from '../env'
import { resolveLanguage } from '../i18n/languages'
import { useDocumentTheme } from '../theme/useDocumentTheme'
import { FormField } from './FormField'

type FieldName = 'name' | 'email' | 'message'
const FIELDS: readonly FieldName[] = ['name', 'email', 'message']
type Values = Record<FieldName, string>
const EMPTY: Values = { name: '', email: '', message: '' }

/** Message keys under `contactForm.errors`, per field; `turnstile` is the widget. */
type FieldErrors = Partial<Record<FieldName | 'turnstile', string>>

/** The backend's limits (API contract, POST /contact), so a message is never rejected only server-side. */
const LIMITS = { name: 100, email: 254, messageMin: 10, message: 5000 } as const
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Status =
  | { kind: 'idle' }
  | { kind: 'invalid' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'rateLimited'; retryAfter: number | null }
  | { kind: 'error' }

function validateField(name: FieldName, value: string): string | null {
  const trimmed = value.trim()
  switch (name) {
    case 'name':
      if (trimmed === '') return 'nameRequired'
      return trimmed.length > LIMITS.name ? 'nameTooLong' : null
    case 'email':
      if (trimmed === '') return 'emailRequired'
      if (trimmed.length > LIMITS.email) return 'emailTooLong'
      return EMAIL.test(trimmed) ? null : 'emailInvalid'
    case 'message':
      if (trimmed === '') return 'messageRequired'
      if (trimmed.length < LIMITS.messageMin) return 'messageTooShort'
      return trimmed.length > LIMITS.message ? 'messageTooLong' : null
  }
}

/**
 * A 422 names the rejected fields; the form shows its own message for each. The client check runs
 * first (it usually finds the same fault), and a field the client considers fine, rejected by a
 * stricter server rule, gets the generic "check this field".
 */
function serverFieldErrors(fields: Readonly<Record<string, string>>, values: Values): FieldErrors {
  const errors: FieldErrors = {}
  for (const name of FIELDS) {
    if (Object.hasOwn(fields, name)) errors[name] = validateField(name, values[name]) ?? 'fieldInvalid'
  }
  if (Object.hasOwn(fields, 'turnstileToken')) errors.turnstile = 'turnstileRequired'
  return errors
}

const CONTROL =
  'block w-full border-b border-line bg-transparent py-3 text-fg transition-colors duration-200 ' +
  'placeholder:text-muted focus:border-fg aria-[invalid=true]:border-error'
// aria-disabled, not disabled, while sending: a disabled button loses focus (the browser moves it to
// <body>), which would strand a keyboard user when the request fails and the button comes back.
const SUBMIT =
  'inline-flex min-h-11 cursor-pointer items-center justify-center bg-accent px-6 font-mono text-sm text-accent-fg ' +
  'transition-opacity duration-200 hover:opacity-90 aria-disabled:cursor-not-allowed aria-disabled:opacity-60'
const AGAIN =
  'inline-flex min-h-11 cursor-pointer items-center font-mono text-sm text-accent underline decoration-muted ' +
  'underline-offset-8 transition-colors duration-200 hover:decoration-accent'

/**
 * The contact form: name, email and message, a honeypot for bots, a Cloudflare Turnstile widget
 * that follows the page theme and language, and one polite live region for its status. Inline
 * validation mirrors the backend's limits; a 422 maps the server's field names back onto the
 * fields. On success the form gives way to a confirmation that takes focus.
 */
export function ContactForm() {
  const { t, i18n } = useTranslation()
  const theme = useDocumentTheme()
  const language = resolveLanguage(i18n.language) === 'zh-Hant' ? 'zh-TW' : 'en'
  // The widget re-renders for a new theme or language and issues a new token; an older one is never sent.
  const widgetKey = `${theme}:${language}`
  const id = useId()
  const [values, setValues] = useState<Values>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [attempted, setAttempted] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [issued, setIssued] = useState<{ token: string; widget: string } | null>(null)
  const token = issued?.widget === widgetKey ? issued.token : null
  const widget = useRef<TurnstileInstance | undefined>(undefined)
  const websiteInput = useRef<HTMLInputElement>(null)
  const controls = useRef<Partial<Record<FieldName, HTMLInputElement | HTMLTextAreaElement | null>>>({})
  const successHeading = useRef<HTMLHeadingElement>(null)
  const request = useRef<AbortController | null>(null)
  const focusNameOnReset = useRef(false)

  useEffect(() => () => request.current?.abort(), [])

  // The form is gone once sent: focus moves to the confirmation so keyboard and screen-reader users are not stranded.
  // "Send another message" removes that button in turn, so focus then goes to the first field of the new form.
  useEffect(() => {
    if (status.kind === 'success') successHeading.current?.focus()
    if (status.kind === 'idle' && focusNameOnReset.current) {
      focusNameOnReset.current = false
      controls.current.name?.focus()
    }
  }, [status.kind])

  const setError = (name: keyof FieldErrors, key: string | null) =>
    setErrors((current) => {
      const next = { ...current }
      if (key === null) delete next[name]
      else next[name] = key
      return next
    })

  const change = (name: FieldName) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    // A field already marked invalid re-validates as it is corrected; a clean one waits for blur.
    if (errors[name]) setError(name, validateField(name, value))
  }

  const blur = (name: FieldName) => (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { value } = event.target
    // Tabbing through an untouched field is not a mistake yet; after a submit attempt it is.
    if (attempted || value.trim() !== '') setError(name, validateField(name, value))
  }

  const focusFirstInvalid = (invalid: FieldErrors) => {
    const first = FIELDS.find((name) => invalid[name])
    if (first) controls.current[first]?.focus()
  }

  const resetWidget = () => {
    widget.current?.reset()
    setIssued(null)
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status.kind === 'submitting') return
    setAttempted(true)

    const invalid: FieldErrors = {}
    for (const name of FIELDS) {
      const key = validateField(name, values[name])
      if (key) invalid[name] = key
    }
    if (token === null) invalid.turnstile = 'turnstileRequired'
    setErrors(invalid)
    if (token === null || Object.keys(invalid).length > 0) {
      setStatus({ kind: 'invalid' })
      focusFirstInvalid(invalid)
      return
    }

    setStatus({ kind: 'submitting' })
    const controller = new AbortController()
    request.current = controller
    try {
      await submitContact(
        {
          name: values.name.trim(),
          email: values.email.trim(),
          message: values.message.trim(),
          turnstileToken: token,
          // Uncontrolled on purpose: a bot that writes straight to the DOM must still be caught.
          website: websiteInput.current?.value ?? '',
        },
        controller.signal,
      )
      setValues(EMPTY)
      setStatus({ kind: 'success' })
    } catch (error) {
      if (isAbortError(error)) return
      if (error instanceof ApiHttpError && error.status === 422) {
        const fromServer = serverFieldErrors(error.fields ?? {}, values)
        // A rejection that names no field the visitor can see (a hidden field, a rule this build does
        // not know yet) must still be reported; the token was never checked, so the widget stays.
        if (Object.keys(fromServer).length === 0) {
          setStatus({ kind: 'error' })
          return
        }
        setErrors(fromServer)
        setStatus({ kind: 'invalid' })
        focusFirstInvalid(fromServer)
        return
      }
      if (error instanceof ApiHttpError && error.status === 429) {
        setStatus({ kind: 'rateLimited', retryAfter: error.retryAfter })
        return
      }
      // The verification was rejected, the backend failed or never answered: the token is spent either way.
      setStatus({ kind: 'error' })
      resetWidget()
    } finally {
      if (request.current === controller) request.current = null
    }
  }

  const startOver = () => {
    setErrors({})
    setAttempted(false)
    setIssued(null)
    focusNameOnReset.current = true
    setStatus({ kind: 'idle' })
  }

  const submitting = status.kind === 'submitting'
  // "Check the highlighted fields" lives exactly as long as a field is highlighted: once the visitor
  // has corrected every fault the line clears, instead of nagging until the next submit.
  const shown: Status = status.kind === 'invalid' && Object.keys(errors).length === 0 ? { kind: 'idle' } : status
  const failed = shown.kind === 'invalid' || shown.kind === 'error' || shown.kind === 'rateLimited'
  const statusText = statusMessage(shown, t)
  const statusId = `${id}-status`
  const titleId = `${id}-title`
  const fieldId = (name: FieldName) => `${id}-${name}`
  const controlProps = (name: FieldName) => ({
    id: fieldId(name),
    name,
    'aria-required': true,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${fieldId(name)}-error` : undefined,
    value: values[name],
    onChange: change(name),
    onBlur: blur(name),
  })
  const errorText = (name: FieldName) => (errors[name] ? t(`contactForm.errors.${errors[name]}`) : null)

  return (
    <div>
      {status.kind === 'success' ? (
        <h3 ref={successHeading} tabIndex={-1} className="text-title font-medium">
          {t('contactForm.success.title')}
        </h3>
      ) : (
        <form
          noValidate
          onSubmit={onSubmit}
          aria-labelledby={titleId}
          aria-describedby={statusId}
          aria-busy={submitting}
          className="relative"
        >
          <h3 id={titleId} className="text-title font-medium">
            {t('contactForm.title')}
          </h3>
          <p className="mt-3 text-muted">{t('contactForm.intro')}</p>

          <div className="mt-8 grid gap-x-8 gap-y-6 md:grid-cols-2">
            <FormField id={fieldId('name')} label={t('contactForm.name')} error={errorText('name')}>
              <input
                {...controlProps('name')}
                ref={(element) => {
                  controls.current.name = element
                }}
                type="text"
                autoComplete="name"
                className={CONTROL}
              />
            </FormField>
            <FormField id={fieldId('email')} label={t('contactForm.email')} error={errorText('email')}>
              <input
                {...controlProps('email')}
                ref={(element) => {
                  controls.current.email = element
                }}
                type="email"
                autoComplete="email"
                className={CONTROL}
              />
            </FormField>
            <FormField
              id={fieldId('message')}
              label={t('contactForm.message')}
              error={errorText('message')}
              className="md:col-span-2"
            >
              {/* data-lenis-prevent: a long message scrolls inside the box, not the page. */}
              <textarea
                {...controlProps('message')}
                ref={(element) => {
                  controls.current.message = element
                }}
                rows={6}
                data-lenis-prevent
                className={`${CONTROL} resize-y`}
              />
            </FormField>
          </div>

          {/* Honeypot: off-screen, out of the accessibility tree and the tab order; bots fill it, people cannot. */}
          <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
            <label htmlFor={`${id}-website`}>{t('contactForm.honeypot')}</label>
            <input
              ref={websiteInput}
              id={`${id}-website`}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </div>

          <div className="mt-8">
            <Turnstile
              ref={widget}
              siteKey={TURNSTILE_SITE_KEY}
              options={{ theme, language, size: 'flexible', appearance: 'always' }}
              onSuccess={(value) => {
                setIssued({ token: value, widget: widgetKey })
                setError('turnstile', null) // a fresh token answers a "complete the verification" left by an early submit
              }}
              onExpire={() => setIssued(null)}
              onError={() => setIssued(null)}
            />
            {errors.turnstile ? (
              <p className="mt-2 text-sm text-error">{t(`contactForm.errors.${errors.turnstile}`)}</p>
            ) : null}
          </div>

          <div className="mt-8">
            {/* onSubmit ignores a second submit while one is pending. */}
            <button type="submit" aria-disabled={submitting || undefined} className={SUBMIT}>
              {submitting ? t('contactForm.submitting') : t('contactForm.submit')}
            </button>
          </div>
        </form>
      )}

      {/* Always mounted (a live region announces only changes to a region that already exists) and
          at the same position in both states, so React keeps the element across the swap. */}
      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={`mt-6 text-pretty empty:mt-0 ${failed ? 'text-error' : 'text-muted'}`}
      >
        {statusText}
      </p>

      {status.kind === 'success' ? (
        <button type="button" onClick={startOver} className={`${AGAIN} mt-6`}>
          {t('contactForm.success.again')}
        </button>
      ) : null}
    </div>
  )
}

function statusMessage(status: Status, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (status.kind) {
    case 'idle':
      return ''
    case 'invalid':
      return t('contactForm.errors.fixFields')
    case 'submitting':
      return t('contactForm.submitting')
    case 'success':
      return t('contactForm.success.body')
    case 'rateLimited':
      return status.retryAfter === null
        ? t('contactForm.errors.rateLimited')
        : t('contactForm.errors.rateLimitedIn', { count: Math.max(1, Math.ceil(status.retryAfter / 60)) })
    case 'error':
      return t('contactForm.errors.generic')
  }
}
