import { Link, type LinkProps } from 'react-router'
import { useGuardedClick } from '../hooks/useGuardedClick'

/** A router link inside the admin panel that respects unsaved changes on the page it leaves. */
export function AdminLink({ to, replace, state, onClick, ...props }: LinkProps) {
  const guarded = useGuardedClick(to, { replace, state })
  return (
    <Link
      to={to}
      replace={replace}
      state={state}
      {...props}
      onClick={(event) => {
        onClick?.(event)
        guarded(event)
      }}
    />
  )
}
