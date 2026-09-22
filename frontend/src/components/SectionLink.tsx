import type { MouseEvent, ReactNode } from 'react'
import { Link, useMatch } from 'react-router'
import { focusState } from '../animations/navigationFocus'
import { isPlainLeftClick, useScrollTo } from '../animations/useScrollTo'
import { useActiveSectionId } from '../animations/useSmoothScroll'
import { useLocalizedPath } from '../i18n/useLocalizedPath'
import type { SectionId } from '../sections/sectionIds'

interface SectionLinkProps {
  id: SectionId
  className?: string
  children: ReactNode
  /** Runs before the scroll starts, for example to close the mobile menu. */
  onBeforeScroll?: () => void
}

/** Sent with the navigation from other pages, so useHashScroll focuses the heading it lands on. */
const SECTION_FOCUS = focusState('section')

/**
 * A real, localized link to a home page section (href "/en#projects"), so it works without JS and
 * from other pages. A plain click smooth-scrolls there on the home page; either way the section's
 * heading receives focus.
 */
export function SectionLink({ id, className, children, onBeforeScroll }: SectionLinkProps) {
  const localized = useLocalizedPath()
  const active = useActiveSectionId() === id
  const onHome = useMatch('/:lang') !== null
  const { scrollToSection } = useScrollTo()

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainLeftClick(event)) return
    onBeforeScroll?.()
    // Elsewhere the link navigates to /lang#id and useHashScroll lands it.
    if (!onHome) return
    event.preventDefault()
    // One frame lets a closing menu release its scroll lock first.
    requestAnimationFrame(() => scrollToSection(id))
  }

  return (
    <Link
      to={{ pathname: localized('/'), hash: `#${id}` }}
      state={SECTION_FOCUS}
      aria-current={active ? 'true' : undefined}
      className={className}
      onClick={handleClick}
    >
      {children}
    </Link>
  )
}
