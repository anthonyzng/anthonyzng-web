import type Lenis from 'lenis'
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { useLenis } from '../animations/useSmoothScroll'
import { ContactForm } from './ContactForm'
import { CloseIcon, ICON_BUTTON } from './MobileMenu'

/** Opens the dialog from elsewhere on the page (the Email channel). */
export interface ContactDialogHandle {
  open(): void
}

interface ContactDialogProps {
  /** Classes of the button that opens the form. */
  buttonClassName: string
  ref?: Ref<ContactDialogHandle>
}

/**
 * "Send a message": a button that opens the contact form in a native modal <dialog> (focus trap,
 * inert page, Escape, focus back to the button on close). The form mounts on the first opening, so
 * the Turnstile widget loads only for visitors who want to write, and stays mounted afterwards, so
 * closing the dialog by mistake keeps the draft. The page does not scroll behind it (Lenis stopped,
 * `html:has(dialog.contact-dialog[open])`); the panel scrolls on its own (`data-lenis-prevent`).
 * `ref.open()` opens it from another control (the Email channel writes through the form too).
 */
export function ContactDialog({ buttonClassName, ref }: ContactDialogProps) {
  const { t } = useTranslation()
  const lenis = useLenis()
  const lenisRef = useRef<Lenis | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    lenisRef.current = lenis
  }, [lenis])

  // Unmount (a language switch): close and always restart Lenis.
  useEffect(() => {
    const dialog = dialogRef.current
    return () => {
      if (dialog?.open) dialog.close()
      lenisRef.current?.start()
    }
  }, [])

  const show = () => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    setMounted(true)
    dialog.showModal()
    lenisRef.current?.stop()
    setOpen(true)
  }
  useImperativeHandle(ref, () => ({ open: show }))

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="contact-dialog"
        className={buttonClassName}
      >
        {t('home.closing.send')}
      </button>
      <dialog
        ref={dialogRef}
        id="contact-dialog"
        aria-label={t('contactForm.title')}
        data-lenis-prevent
        onClose={() => {
          lenisRef.current?.start()
          setOpen(false)
        }}
        className="contact-dialog m-auto max-h-[90dvh] w-[min(40rem,calc(100%-2rem))] overflow-y-auto overscroll-contain border border-line bg-surface p-0 text-fg backdrop:bg-ink/70"
      >
        <div className="flex justify-end p-2">
          <button
            type="button"
            aria-label={t('home.closing.close')}
            onClick={() => dialogRef.current?.close()}
            className={ICON_BUTTON}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="px-6 pb-8 sm:px-8">{mounted ? <ContactForm /> : null}</div>
      </dialog>
    </>
  )
}
