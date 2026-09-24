import { useEffect, useId, useRef, type ReactNode, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ADMIN_NS } from '../i18n'
import { DANGER_BUTTON, SECONDARY_BUTTON } from '../styles'

interface ConfirmDialogProps {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  /** Shown on the confirm button while `busy`. */
  busyLabel?: string
  /** A request is running: both buttons and Escape do nothing until it settles. */
  busy?: boolean
  /** Why the last attempt failed, shown (and announced) inside the dialog so the user can retry or cancel. */
  error?: string | null
  onConfirm(): void
  onCancel(): void
  /**
   * Runs once the dialog has closed and focus is back on the page. Navigation belongs here, not in
   * `onConfirm`: the platform returns focus to the opener on close, which would otherwise take it
   * away from the heading of the page navigated to.
   */
  onClosed?(): void
  /** Where focus goes on close when the element that opened the dialog is gone (a deleted row). */
  fallbackFocus?: () => HTMLElement | null
}

/**
 * A confirmation as a native modal `<dialog>`: focus trap, inert page and Escape come from the
 * platform. Focus starts on Cancel (the safe choice) and returns to the element that opened the
 * dialog, or to `fallbackFocus` when that element no longer exists. Every confirmation here drops
 * something (a row, a file, unsaved changes), so the confirm button is the danger one.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busyLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
  onClosed,
  fallbackFocus,
}: ConfirmDialogProps) {
  const { t } = useTranslation(ADMIN_NS)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const openRef = useRef(open)
  const busyRef = useRef(busy)
  const titleId = useId()
  const bodyId = useId()
  const errorId = useId()
  const describedBy = [children ? bodyId : null, error ? errorId : null].filter(Boolean).join(' ')

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    openRef.current = open
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
      cancelRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  // `close` also fires when the platform closes the dialog on its own (a second Escape cannot always
  // be refused); the parent is told, so the two never disagree.
  const onClose = () => {
    if (openRef.current && busyRef.current) {
      // Mid-request: the dialog comes back, so its outcome (done, or an error to retry) is not lost.
      // (A dialog already out of the document belongs to a page being left: nothing to bring back.)
      if (dialogRef.current?.isConnected) dialogRef.current.showModal()
      return
    }
    const target = returnTo.current
    returnTo.current = null
    if (target?.isConnected) target.focus()
    else fallbackFocus?.()?.focus()
    if (openRef.current) onCancel()
    onClosed?.()
  }

  // Escape: the parent decides (it may be busy), the dialog never closes itself.
  const onCancelEvent = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    if (!busy) onCancel()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={describedBy || undefined}
      onCancel={onCancelEvent}
      onClose={onClose}
      // Preflight zeroes the platform's centring margin: 4rem from the top instead, centred across.
      className="mx-auto mt-16 border border-line bg-surface p-6 text-fg"
    >
      {/* The width cap sits inside, so the dialog stays within the platform's viewport margin on a phone. */}
      <div className="max-w-xl">
        <h2 id={titleId} className="text-lg font-semibold text-balance">
          {title}
        </h2>
        {children ? (
          <div id={bodyId} className="mt-3 text-muted">
            {children}
          </div>
        ) : null}
        {/* Always in the dialog, empty until a failure: an alert that exists before its text arrives is announced reliably. */}
        <p id={errorId} role="alert" className="mt-4 text-sm text-error empty:mt-0">
          {error ?? null}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => {
              if (!busy) onCancel()
            }}
            aria-disabled={busy || undefined}
            className={SECONDARY_BUTTON}
          >
            {t('dialog.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!busy) onConfirm()
            }}
            aria-disabled={busy || undefined}
            className={DANGER_BUTTON}
          >
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
