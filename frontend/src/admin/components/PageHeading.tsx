import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { HEADING } from '../styles'

/**
 * The page's h1. After an in-app navigation (a link, a redirect, a save, another page of a list) it
 * takes focus, so keyboard and screen-reader users start on the new page instead of on <body>; the
 * first page of a visit and Back/Forward leave focus where the browser puts it. Every navigation
 * counts, one that only changes the query (Next page) included: the location key changes each time.
 */
export function PageHeading({
  children,
  className = '',
  describedBy,
}: {
  children: ReactNode
  className?: string
  /** A notice read together with the heading when it takes focus (e.g. "your session has expired"). */
  describedBy?: string
}) {
  const ref = useRef<HTMLHeadingElement>(null)
  const navigationType = useNavigationType()
  const { key } = useLocation()

  useEffect(() => {
    if (navigationType !== 'POP') ref.current?.focus()
  }, [navigationType, key])

  return (
    <h1 ref={ref} tabIndex={-1} aria-describedby={describedBy} className={`${HEADING} ${className}`}>
      {children}
    </h1>
  )
}
