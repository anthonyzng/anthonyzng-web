import { useEffect, useRef } from 'react'
import { useLeaveGuard } from '../shell/leaveGuardContext'

/**
 * While `dirty`, admin links and sign-out ask before leaving (see LeaveGuardContext) and the browser
 * asks before a reload, a closed tab or an address typed in the bar. `onDiscard` runs once the user
 * has confirmed leaving the changes behind in the app and leaving worked (a failed sign-out keeps
 * them, and the guard stays armed).
 */
export function useUnsavedChanges(dirty: boolean, onDiscard?: () => void): void {
  const { setDirty } = useLeaveGuard()
  const latestDiscard = useRef(onDiscard)

  useEffect(() => {
    latestDiscard.current = onDiscard
  })

  useEffect(() => {
    setDirty(dirty, () => latestDiscard.current?.())
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Older browsers show the prompt only when returnValue is set.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, setDirty])

  useEffect(() => () => setDirty(false), [setDirty])
}
