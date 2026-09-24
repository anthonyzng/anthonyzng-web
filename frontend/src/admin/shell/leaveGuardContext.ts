import { createContext, useContext } from 'react'

/**
 * Leaves the page: a navigation, or a sign-out. It answers whether leaving worked (true) or failed
 * and the user is still on the page (false), at once or when a request has settled.
 */
export type LeaveAction = () => boolean | Promise<boolean>

/**
 * Unsaved-changes protection for in-app navigation. The router here is declarative (no data
 * router, so no `useBlocker`): every admin link and the sign-out button ask `confirmLeave`
 * instead, and `useUnsavedChanges` adds the browser's own prompt for reloads and closed tabs.
 */
export interface LeaveGuardValue {
  /** Whether the current page holds unsaved changes (read at click time). */
  isDirty(): boolean
  /** `onDiscard` runs once the user has chosen to leave the changes behind and leaving worked. */
  setDirty(dirty: boolean, onDiscard?: () => void): void
  /**
   * Runs `proceed` now, or after the user confirms that the unsaved changes may be dropped. They are
   * dropped (the kept draft forgotten, the guard disarmed) only once `proceed` has worked: a failed
   * sign-out leaves the page, its draft and the guard as they were.
   */
  confirmLeave(proceed: LeaveAction): void
}

const unguarded: LeaveGuardValue = {
  isDirty: () => false,
  setDirty: () => {},
  confirmLeave: (proceed) => void proceed(),
}

export const LeaveGuardContext = createContext<LeaveGuardValue>(unguarded)

export const useLeaveGuard = (): LeaveGuardValue => useContext(LeaveGuardContext)
