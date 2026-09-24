import { useCallback, useEffect, useRef } from 'react'

/**
 * Focus for list editors: `focusAfterRender(id)` moves focus to the element with that id once the
 * change that re-renders the list has been committed (a row moved, added or removed).
 */
export function usePendingFocus(): (id: string) => void {
  const pending = useRef<string | null>(null)

  useEffect(() => {
    if (pending.current === null) return
    document.getElementById(pending.current)?.focus()
    pending.current = null
  })

  return useCallback((id: string) => {
    pending.current = id
  }, [])
}
