import type Lenis from 'lenis'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { MD_UP, mediaMatches, watchMedia } from '../animations/media'
import { useLenis } from '../animations/useSmoothScroll'
import { formatIndex, SECTION_IDS } from '../sections/sectionIds'
import { SectionLink } from './SectionLink'

/** The same query as the md:hidden on the menu button, so the JS and CSS layouts always agree. */
const DESKTOP_QUERY = MD_UP
export const ICON_BUTTON =
  'inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-200 hover:bg-surface hover:text-fg'

interface MobileMenuProps {
  /** The desktop nav: it takes focus when the menu closes because the viewport reached the desktop layout. */
  desktopNav: RefObject<HTMLElement | null>
}

/**
 * Below md: a menu button that opens a full-screen native modal <dialog> (focus trap, inert page,
 * top layer and Escape for free) listing the sections. Motion is CSS only (see .mobile-menu).
 * Theme and language controls stay in the header and are not duplicated here.
 */
export function MobileMenu({ desktopNav }: MobileMenuProps) {
  const { t } = useTranslation()
  const lenis = useLenis()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const previousPathname = useRef(pathname)

  useEffect(() => {
    lenisRef.current = lenis
  }, [lenis])

  const openMenu = useCallback(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    lenisRef.current?.stop() // html.lenis-stopped clips the page; data-lenis-prevent lets the panel scroll
    setOpen(true)
    // React's autoFocus fires at mount, not at showModal(), so focus is moved explicitly.
    closeRef.current?.focus()
  }, [])

  const closeMenu = useCallback(() => {
    // Synchronously: Lenis ignores scrollTo while stopped, and a link tap scrolls right after this.
    lenisRef.current?.start()
    const dialog = dialogRef.current
    if (dialog?.open) dialog.close()
    setOpen(false)
  }, [])

  // The close event is async and also covers Escape (native cancel -> close).
  const onDialogClose = () => {
    lenisRef.current?.start()
    setOpen(false)
    const active = document.activeElement
    // Never steal focus from a section heading a link has focused in the meantime.
    if (active && active !== document.body && !dialogRef.current?.contains(active)) return
    // At the desktop layout the menu button is display:none and cannot take focus. Both targets sit
    // in the sticky header, always in view: preventScroll stops the focus from moving the page.
    const target = mediaMatches(DESKTOP_QUERY) ? desktopNav.current?.querySelector<HTMLElement>('a') : triggerRef.current
    target?.focus({ preventScroll: true })
  }

  // Close on route (or language) change.
  useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    if (dialogRef.current?.open) closeMenu()
  }, [pathname, closeMenu])

  // Close when the viewport reaches the desktop layout, where the menu button is hidden.
  useEffect(
    () =>
      watchMedia(DESKTOP_QUERY, (matches) => {
        if (matches && dialogRef.current?.open) closeMenu()
      }),
    [closeMenu],
  )

  // Unmount (a language switch unmounts the header for a frame): close and always restart Lenis.
  useEffect(() => {
    const dialog = dialogRef.current
    return () => {
      if (dialog?.open) dialog.close()
      lenisRef.current?.start()
    }
  }, [])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openMenu}
        aria-label={t('nav.openMenu')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="mobile-menu"
        className={`${ICON_BUTTON} md:hidden`}
      >
        <MenuIcon />
      </button>

      <dialog
        ref={dialogRef}
        id="mobile-menu"
        aria-label={t('nav.menu')}
        data-lenis-prevent
        onClose={onDialogClose}
        className="mobile-menu fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain bg-bg p-0 text-fg"
      >
        <div className="mx-auto flex h-(--header-h) max-w-6xl items-center justify-between border-b border-line/60 px-5 sm:px-8">
          <span aria-hidden="true" className="font-mono text-sm font-medium tracking-tight">
            anthonyzng<span className="text-accent">.</span>
          </span>
          <button ref={closeRef} type="button" aria-label={t('nav.closeMenu')} onClick={closeMenu} className={ICON_BUTTON}>
            <CloseIcon />
          </button>
        </div>
        <nav aria-label={t('nav.primary')} className="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
          <ol>
            {SECTION_IDS.map((id, index) => (
              <li key={id} className="border-b border-line">
                <SectionLink
                  id={id}
                  onBeforeScroll={closeMenu}
                  className="group flex min-h-11 items-baseline gap-4 py-4 forced-colors:aria-[current=true]:underline"
                >
                  <span aria-hidden="true" className="font-mono text-sm text-muted group-aria-[current=true]:text-accent">
                    {formatIndex(index)}
                  </span>
                  <span className="mask-line">
                    <span className="menu-link-label block text-headline font-medium" style={{ '--i': index } as CSSProperties}>
                      {t(`nav.${id}`)}
                    </span>
                  </span>
                </SectionLink>
              </li>
            ))}
          </ol>
        </nav>
      </dialog>
    </>
  )
}

// Stroked with currentColor like CloseIcon: forced colours repaint backgrounds as Canvas, so CSS bars would vanish.
function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M3 8.5h18M3 15.5h18" />
    </svg>
  )
}

export function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
