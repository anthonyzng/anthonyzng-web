import { useEffect, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { isPlainLeftClick, useScrollTo } from '../animations/useScrollTo'
import { fileUrl } from '../api/files'
import { useResolvedContent } from '../content/contentContext'
import { formatFileSize } from '../i18n/formatFileSize'
import { useLocalizedPath } from '../i18n/useLocalizedPath'
import { SECTION_IDS } from '../sections/sectionIds'
import { DownloadIcon } from './DownloadIcon'
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
 * and is no part of <main>'s content, which the reading anchor walks. Once a CV is uploaded, a
 * download button ends the pill; on a narrow screen the section links scroll sideways and the
 * download stays in view.
 */
export function SectionDock() {
  const { t, i18n } = useTranslation()
  const { cv } = useResolvedContent()
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
      <div className="pointer-events-auto flex max-w-full items-center rounded-full border border-line bg-surface/85 p-1 shadow-lg backdrop-blur-md">
        {/* Narrow screens: the links scroll sideways, and the edge fades to say there is more. */}
        <ul
          role="list"
          className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-full [scrollbar-width:none] max-sm:pr-5 max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-1.5rem),transparent)]"
        >
          <li className="shrink-0">
            <Link to={localized('/')} onClick={toTop} className={DOCK_LINK}>
              {t('nav.top')}
            </Link>
          </li>
          {SECTION_IDS.map((id) => (
            <li key={id} className="shrink-0">
              <SectionLink id={id} className={DOCK_LINK}>
                {t(`nav.${id}`)}
              </SectionLink>
            </li>
          ))}
        </ul>
        {cv ? (
          <>
            <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line" />
            <a
              href={fileUrl(cv.url)}
              download
              type="application/pdf"
              aria-label={t('content.contact.cvDownload', { size: formatFileSize(cv.size, i18n.language) })}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg transition-opacity duration-200 hover:opacity-90 sm:px-3.5 sm:text-sm"
            >
              <DownloadIcon className="size-3.5 sm:size-4" />
              {t('nav.cv')}
            </a>
          </>
        ) : null}
      </div>
    </nav>,
    document.body,
  )
}
