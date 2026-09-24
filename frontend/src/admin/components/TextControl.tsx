import type { ChangeEvent, FocusEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextControl as ControlKind } from '../fields'
import { ADMIN_NS } from '../i18n'
import { ERROR_TEXT, EYEBROW, HINT, INPUT, LABEL } from '../styles'

interface TextControlProps {
  /** The control's id; the hint is `${id}-hint`, the error `${id}-error`. */
  id: string
  label: string
  value: string
  onChange(value: string): void
  onBlur?(event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>): void
  control?: ControlKind | 'email' | 'password'
  /** The language of the text typed here (a zh-Hant field gets Chinese spellcheck and pronunciation). */
  lang?: string
  hint?: string | null
  error?: string | null
  required?: boolean
  /** Marks the label "(optional)". */
  optional?: boolean
  rows?: number
  autoComplete?: string
  /** An identifier or code rather than prose: monospace, no spellcheck, no autocapitalisation. */
  code?: boolean
  /** A secondary label under a group's legend (the language of a translatable field): small caps. */
  subLabel?: boolean
}

const INPUT_TYPE: Record<ControlKind | 'email' | 'password', string> = {
  text: 'text',
  textarea: 'text',
  url: 'url',
  month: 'month',
  year: 'text',
  email: 'email',
  password: 'password',
}

/**
 * A labelled text input or textarea with its hint and inline error. The control carries
 * `aria-invalid` and names both as its description, so the error is read with the field.
 * No `maxLength`: a paste is never truncated silently, an over-long value gets a message instead.
 */
export function TextControl({
  id,
  label,
  value,
  onChange,
  onBlur,
  control = 'text',
  lang,
  hint,
  error,
  required = false,
  optional = false,
  rows = 4,
  autoComplete,
  code = false,
  subLabel = false,
}: TextControlProps) {
  const { t } = useTranslation(ADMIN_NS)
  const hintId = hint ? `${id}-hint` : null
  const errorId = error ? `${id}-error` : null
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const common = {
    id,
    value,
    lang,
    onBlur,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': required || undefined,
    ...(code ? { spellCheck: false, autoCapitalize: 'none', autoCorrect: 'off' } : {}),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
  }

  return (
    <div>
      <label htmlFor={id} className={subLabel ? `block ${EYEBROW}` : LABEL}>
        {label}
        {optional ? (
          <>
            {' '}
            <span className="text-muted">{t('fields.optional')}</span>
          </>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId ?? undefined} className={`mt-1 ${HINT}`}>
          {hint}
        </p>
      ) : null}
      {/* A month or a year needs no full-width box: the control keeps its natural width. */}
      <div className={control === 'month' || control === 'year' ? 'mt-2 w-fit' : 'mt-2'}>
        {control === 'textarea' ? (
          <textarea {...common} rows={rows} className={`${INPUT} resize-y`} />
        ) : (
          <input
            {...common}
            type={INPUT_TYPE[control]}
            autoComplete={autoComplete}
            inputMode={control === 'year' ? 'numeric' : undefined}
            placeholder={control === 'month' ? 'YYYY-MM' : control === 'year' ? 'YYYY' : undefined}
            className={code ? `${INPUT} font-mono text-sm` : INPUT}
          />
        )}
      </div>
      {error ? (
        <p id={errorId ?? undefined} className={`mt-1 ${ERROR_TEXT}`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
