import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAbortError } from '../../api/client'
import { isUnauthorized } from '../api'
import { ADMIN_NS } from '../i18n'
import { useSession } from '../session/sessionContext'
import { useStatus } from '../shell/statusContext'

/**
 * `data` is what is on screen for the current key, if anything: during a reload (`loading`) and
 * after a failed one (`error`) it is the data from before, which the page keeps showing.
 */
export type QueryState<T> =
  | { status: 'loading'; data: T | null }
  | { status: 'error'; data: T | null }
  | { status: 'ready'; data: T }

/** The data on screen, and the key it belongs to. */
interface Loaded<T> {
  key: string
  data: T
}

/** How the last attempt for a key ended. Kept apart from the data: a failed reload leaves the data alone. */
interface Outcome {
  key: string
  attempt: number
  ok: boolean
}

/**
 * Loads a page's data: aborted on unmount or when `key` changes, a 401 ends the session (the guard
 * then returns to the login page), and a reload keeps the data on screen while it runs. A failed
 * reload leaves that data on screen too (status `error` with data: the page shows a "could not
 * refresh" notice), and `setData` always edits it (optimistic updates, rows returned by a save or a
 * move), so the screen follows every successful answer. `reload` fetches again quietly; `retry` is
 * the user's Retry, whose success is announced in the status region (a failure is announced by the
 * LoadError alert that shows again).
 */
export function useAdminQuery<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const { t } = useTranslation(ADMIN_NS)
  const { expire } = useSession()
  const { announce } = useStatus()
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const latest = useRef({ load, key, loadedText: t('common.loaded') })
  // Set by `retry`, taken by the attempt it starts.
  const announceNext = useRef(false)

  useEffect(() => {
    latest.current = { load, key, loadedText: t('common.loaded') }
  })

  useEffect(() => {
    const controller = new AbortController()
    const announceSuccess = announceNext.current
    announceNext.current = false
    latest.current.load(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return
        setLoaded({ key, data })
        setOutcome({ key, attempt, ok: true })
        if (announceSuccess) announce(latest.current.loadedText)
      },
      (error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return
        if (isUnauthorized(error)) {
          expire()
          return
        }
        setOutcome({ key, attempt, ok: false })
      },
    )
    return () => controller.abort()
  }, [key, attempt, expire, announce])

  const reload = useCallback(() => setAttempt((current) => current + 1), [])

  const retry = useCallback(() => {
    announceNext.current = true
    setAttempt((current) => current + 1)
  }, [])

  // Only the data of the key on screen: an answer that arrives after the page moved on (another
  // page of the inbox) must not edit the data of the new one.
  const setData = useCallback((update: (data: T) => T) => {
    const shown = latest.current.key
    setLoaded((current) => (current !== null && current.key === shown ? { key: shown, data: update(current.data) } : current))
  }, [])

  const current = loaded?.key === key ? loaded : null
  let state: QueryState<T>
  if (outcome?.key === key && outcome.attempt === attempt) {
    state = outcome.ok && current ? { status: 'ready', data: current.data } : { status: 'error', data: current?.data ?? null }
  } else {
    state = { status: 'loading', data: current?.data ?? null }
  }

  return { state, reload, retry, setData }
}
