import { useState } from 'react'
import { ApiHttpError, isAbortError } from '../../api/client'
import { isUnauthorized } from '../api'
import { useSession } from '../session/sessionContext'
import { useLifetimeSignal } from './useLifetimeSignal'

interface ConfirmedActionOptions<Target, Result> {
  /** The request; `signal` aborts it if the page goes away first. */
  run(target: Target, signal: AbortSignal): Promise<Result>
  /** After success; `result` is null when a 404 counted as success (see `notFoundIsDone`). */
  onDone(target: Target, result: Result | null): void
  /** Shown inside the dialog when the request fails; the dialog stays open for a retry. */
  failed: string
  /** A 404 means the thing is already gone (deleted in another tab): the goal is reached. */
  notFoundIsDone?: boolean
}

/**
 * A destructive action behind a ConfirmDialog (delete a row or a message, remove the CV or a cover
 * image): `open(target)` shows the dialog, confirming runs the request with both buttons held, a
 * failure stays in the dialog, a 401 ends the session. Spread `dialog` onto the ConfirmDialog.
 */
export function useConfirmedAction<Target, Result>({
  run,
  onDone,
  failed,
  notFoundIsDone = false,
}: ConfirmedActionOptions<Target, Result>) {
  const { expire } = useSession()
  const lifetime = useLifetimeSignal()
  const [state, setState] = useState<{ target: Target; busy: boolean; error: string | null } | null>(null)

  const confirm = async () => {
    if (state === null || state.busy) return
    const { target } = state
    setState({ target, busy: true, error: null })
    let result: Result | null = null
    try {
      result = await run(target, lifetime())
    } catch (failure) {
      if (isAbortError(failure)) return // the page went away
      if (isUnauthorized(failure)) {
        setState(null)
        expire()
        return
      }
      if (!(notFoundIsDone && failure instanceof ApiHttpError && failure.status === 404)) {
        setState({ target, busy: false, error: failed })
        return
      }
    }
    setState(null)
    onDone(target, result)
  }

  return {
    /** What the open dialog is about, or null. */
    target: state?.target ?? null,
    open: (target: Target) => setState({ target, busy: false, error: null }),
    dialog: {
      open: state !== null,
      busy: state?.busy ?? false,
      error: state?.error ?? null,
      onConfirm: () => void confirm(),
      onCancel: () => setState(null),
    },
  }
}
