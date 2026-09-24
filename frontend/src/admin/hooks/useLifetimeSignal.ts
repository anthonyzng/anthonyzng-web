import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * An AbortSignal that fires when the component unmounts, for requests started by an event handler
 * (a move, a delete, a read flag): once the user has left the page, the answer is dropped instead
 * of updating state or announcing a result on the page they went to. A layout effect, so the
 * signal exists before the first paint: no click can come early enough to get an aborted one.
 */
export function useLifetimeSignal(): () => AbortSignal {
  const controller = useRef<AbortController | null>(null)

  useLayoutEffect(() => {
    const current = new AbortController()
    controller.current = current
    return () => current.abort()
  }, [])

  return useCallback(() => controller.current?.signal ?? AbortSignal.abort(), [])
}
