import type { ReactNode } from 'react'

interface FormFieldProps {
  /** The control's id; the label points at it and the error message is `${id}-error`. */
  id: string
  label: string
  /** The translated message, or nothing. The control itself carries `aria-invalid` / `aria-describedby`. */
  error?: string | null
  className?: string
  children: ReactNode
}

/**
 * Label, control and inline error for one contact-form field. The label is a real `<label for>`;
 * the error is a plain paragraph with a predictable id, so the control can name it as its
 * description and assistive tech reads it with the field, not as a stray line.
 */
export function FormField({ id, label, error, className, children }: FormFieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block font-mono text-sm uppercase tracking-label text-muted">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
