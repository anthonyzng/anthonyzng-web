import type { MouseEvent } from 'react'
import { useNavigate, type To } from 'react-router'
import { isPlainLeftClick } from '../../animations/useScrollTo'
import { useLeaveGuard } from '../shell/leaveGuardContext'

/**
 * A link click handler that asks before leaving unsaved changes. A modified click (new tab or
 * window), a click already handled, and a page without unsaved changes are left to the link itself.
 */
export function useGuardedClick(to: To, options: { replace?: boolean; state?: unknown } = {}) {
  const guard = useLeaveGuard()
  const navigate = useNavigate()
  return (event: MouseEvent<HTMLAnchorElement>) => {
    // The site's own check: primary button, no modifier, not prevented by an earlier handler.
    if (!isPlainLeftClick(event) || !guard.isDirty()) return
    event.preventDefault()
    guard.confirmLeave(() => {
      void navigate(to, options)
      return true
    })
  }
}
