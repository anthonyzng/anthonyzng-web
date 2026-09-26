import { useEffect, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { isPlainLeftClick, useScrollTo } from '../animations/useScrollTo'
import { useLocalizedPath } from '../i18n/useLocalizedPath'
import { SECTION_IDS } from '../sections/sectionIds'
import { SectionLink } from './SectionLink'

/** Scrolled this far (px), the page is no longer "at the top" and the dock appears. */
const DOCK_THRESHOLD = 80

const DOCK_LINK =
  'inline-flex min-h-10 items-center rounded-full px-2.5 text-xs text-muted transition-colors duration-200 hover:text-fg sm:px-3.5 sm:text-sm ' +
  'aria-[current=true]:bg-bg aria-[current=true]:text-fg forced-colors:aria-[current=true]:underline'

/**
 * A floating pill at the foot of the home page with the way back to the top and to every section,
 * shown once the page has left the top. The current section is marked (`aria-current`, as in the
 * header). While hidden it is `inert`, so it can be neither focused nor read. Motion: a CSS
 * fade and rise, none with reduced motion. Rendered into <body> (a portal): it floats over the page
 * and is no part of <main>'s content, which the reading anchor walks.
 */
export function SectionDock() {
  const { t } = useTranslation()
  const localized = useLocalizedPath()
  const { scrollToTop } = useScrollTo()
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const update = () => setShown(window.scrollY > DOCK_THRESHOLD)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  const toTop = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainLeftClick(event)) return
    event.preventDefault()
    scrollToTop()
  }

  return createPortal(
    <nav
      aria-label={t('nav.dock')}
      inert={!shown}
      className={`pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3 transition duration-300 ease-out-expo motion-reduce:transition-none ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <ul
        role="list"
        className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-line bg-surface/85 p-1 shadow-lg backdrop-blur-md"
      >
        <li>
          <Link to={localized('/')} onClick={toTop} className={DOCK_LINK}>
            {t('nav.top')}
          </Link>
        </li>
        {SECTION_IDS.map((id) => (
          <li key={id}>
            <SectionLink id={id} className={DOCK_LINK}>
              {t(`nav.${id}`)}
            </SectionLink>
          </li>
        ))}
      </ul>
    </nav>,
    document.body,
  )
}
