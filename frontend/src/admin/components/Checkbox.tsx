import type { ReactNode } from 'react'
import { ERROR_TEXT, HINT } from '../styles'

interface CheckboxProps {
  id: string
  label: ReactNode
  checked: boolean
  onChange(checked: boolean): void
  hint?: string | null
  error?: string | null
}

/** A checkbox whose whole label row is the 44px target, with an optional hint and inline error. */
export function Checkbox({ id, label, checked, onChange, hint, error }: CheckboxProps) {
  const hintId = hint ? `${id}-hint` : null
  const errorId = error ? `${id}-error` : null
  return (
    <div>
      <label htmlFor={id} className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-fg">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className="size-5 shrink-0 cursor-pointer"
        />
        <span className="text-sm font-medium">{label}</span>
      </label>
      {hint ? (
        <p id={hintId ?? undefined} className={HINT}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId ?? undefined} className={`mt-1 ${ERROR_TEXT}`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
