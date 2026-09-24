import { adminPaths } from '../paths'

/** Why the login page is showing, besides "not signed in yet". */
export type LoginReason = 'expired' | 'signedOut'

/** Router state sent to the login page: where to return after signing in, and why the user is here. */
export interface LoginState {
  from?: string
  reason?: LoginReason
}

export const loginState = (
  location: { pathname: string; search: string; hash: string } | null,
  reason?: LoginReason,
): LoginState => ({
  ...(location ? { from: `${location.pathname}${location.search}${location.hash}` } : {}),
  ...(reason ? { reason } : {}),
})

/**
 * Reads the login page's router state defensively (history state survives reloads and can be
 * anything): only an admin page other than the login page itself is a valid way back.
 */
export function readLoginState(state: unknown): { from: string; reason: LoginReason | null } {
  const record = typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {}
  const from =
    typeof record.from === 'string' &&
    /^\/admin(?:[/?#]|$)/.test(record.from) &&
    !record.from.startsWith(adminPaths.login)
      ? record.from
      : adminPaths.dashboard
  const reason = record.reason === 'expired' || record.reason === 'signedOut' ? record.reason : null
  return { from, reason }
}
