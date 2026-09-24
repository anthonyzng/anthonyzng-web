import type { ReactNode } from 'react'
import { Link, useMatch } from 'react-router'
import { useGuardedClick } from '../hooks/useGuardedClick'
import { NAV_ITEM, NAV_ITEM_CURRENT, NAV_ITEM_IDLE } from '../styles'

interface AdminNavLinkProps {
  /** A pathname (no query): the link is current on it and, unless `end`, on every page below it. */
  to: string
  end?: boolean
  children: ReactNode
}

/**
 * A navigation entry with `aria-current="page"` while its section is open, guarded like
 * `AdminLink`. Built on `Link` + `useMatch` rather than `NavLink`: both already ship in the public
 * bundle, while NavLink would be added to it (the router module is shared with this lazy chunk).
 */
export function AdminNavLink({ to, end = false, children }: AdminNavLinkProps) {
  const current = useMatch({ path: to, end }) !== null
  const guarded = useGuardedClick(to)
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      onClick={guarded}
      className={`${NAV_ITEM} ${current ? NAV_ITEM_CURRENT : NAV_ITEM_IDLE}`}
    >
      {children}
    </Link>
  )
}
