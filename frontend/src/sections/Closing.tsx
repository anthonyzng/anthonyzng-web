import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { fileUrl } from '../api/files'
import { useMotionAllowed } from '../animations/useMotionAllowed'
import { useZipperLoop } from '../animations/useZipperLoop'
import { ContactDialog, type ContactDialogHandle } from '../components/ContactDialog'
import { useResolvedContent } from '../content/contentContext'
import { formatFileSize } from '../i18n/formatFileSize'

/** Copies of the rows with motion: enough that the loop always wraps off screen, even on tall screens. */
const LOOP_COPIES = 5

interface Row {
  key: string
  label: string
  value: string
  href: string
  download?: boolean
  /** The email channel: it opens the contact form instead of a mail app (which many visitors lack). */
  mail: boolean
}

/**
 * The contact section, as the page's closing screen: the page fades into ink, "Get in touch" sits in
 * the middle of a sticky screen, and the channels (and the CV, once uploaded) loop past it, each row
 * parting around the title like a zipper (`useZipperLoop`). The moving rows are decorative (hidden
 * from assistive technology, out of the tab order); the bar at the foot of the screen carries the
 * same channels as real links, the location and the "Send a message" button (`ContactDialog`), so
 * every visitor has a still, reachable way to get in touch. The email channel, in the bar and in the
 * loop, is a button that opens that form: a mailto link does nothing without a mail app, and the
 * form delivers to the same inbox. Without motion: one still screen, the title and that bar, no rows.
 */
export function Closing() {
  const { t, i18n } = useTranslation()
  const { contact, cv } = useResolvedContent()
  const motion = useMotionAllowed()
  const scope = useRef<HTMLElement>(null)
  const dialog = useRef<ContactDialogHandle>(null)
  const openForm = () => dialog.current?.open()

  const rows: Row[] = [
    ...contact.links.map((link) => ({
      key: link.id,
      label: link.label,
      value: link.display,
      href: link.href,
      mail: link.href.startsWith('mailto:'),
    })),
    ...(cv
      ? [
          {
            key: 'cv',
            label: t('content.contact.labels.cv'),
            value: t('content.contact.cvDownload', { size: formatFileSize(cv.size, i18n.language) }),
            href: fileUrl(cv.url),
            download: true,
            mail: false,
          },
        ]
      : []),
  ]
  // The language too: the title's width sets how far the rows part.
  useZipperLoop(scope, `${rows.map((row) => row.key).join()}:${motion}:${i18n.language}`)

  const loopRow = 'group grid h-24 w-full cursor-pointer grid-cols-2 items-center gap-x-6 md:h-28'
  const loop = Array.from({ length: LOOP_COPIES }, (_, copy) =>
    rows.map((row) => {
      const content = (
        <>
          <span data-zipper-label className="justify-self-end font-mono text-xs uppercase tracking-label text-ink-muted md:text-sm">
            {row.label}
          </span>
          <span
            data-zipper-value
            className="justify-self-start whitespace-nowrap text-lg text-ink-fg transition-colors duration-200 group-hover:text-ink-accent md:text-2xl"
          >
            {row.value}
          </span>
        </>
      )
      return row.mail ? (
        <button
          key={`${copy}-${row.key}`}
          data-zipper-row
          type="button"
          tabIndex={-1}
          // Never focused by the click: the dialog then hands focus back to where it was, not to
          // a hidden, moving copy.
          onMouseDown={(event) => event.preventDefault()}
          onClick={openForm}
          className={loopRow}
        >
          {content}
        </button>
      ) : (
        <a
          key={`${copy}-${row.key}`}
          data-zipper-row
          href={row.href}
          download={row.download || undefined}
          tabIndex={-1}
          className={loopRow}
        >
          {content}
        </a>
      )
    }),
  )

  const screenHeight = 'calc(100svh - var(--header-h))'

  return (
    <>
      {/* The page washes into ink before the section; the section itself starts on ink, so a link
          to #contact lands on the whole screen. */}
      <div aria-hidden="true" className="h-[30svh] bg-linear-to-b from-bg to-ink" />
      <section
        ref={scope}
        id="contact"
        data-closing
        aria-labelledby="contact-title"
        className={`relative bg-ink ${motion ? 'h-[260svh]' : ''}`}
      >
        <div
          data-zipper-screen
          style={motion ? { height: screenHeight } : { minHeight: screenHeight }}
          className={`${motion ? 'sticky top-(--header-h)' : 'relative'} overflow-hidden text-ink-fg`}
        >
          {motion ? (
            <div aria-hidden="true" className="absolute inset-x-0 top-0 flex flex-col">
              {loop}
            </div>
          ) : null}

          {/* Raised well above the bar, so the title has the room it needs. */}
          <div data-zipper-title className="pointer-events-none absolute inset-0 grid place-items-center pb-[max(9rem,30svh)]">
            <h2 id="contact-title" tabIndex={-1} className="text-title font-medium outline-none md:text-headline">
              <span data-zipper-title-text>{t('home.closing.title')}</span>
            </h2>
          </div>

          {/* The still way in: real links, the location and the form. Rows fade out behind it. */}
          {/* Below md the channels show their labels only (the addresses stay in the accessible
              name), so the bar never crowds out the screen on a phone. */}
          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-ink from-60% to-transparent pt-12 pb-20 md:pt-16 md:pb-24">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 sm:px-8 md:flex-row md:items-end md:justify-between md:gap-6">
              <ul role="list" aria-label={t('home.closing.channels')} className="flex flex-wrap gap-x-5 gap-y-0 md:gap-x-8 md:gap-y-1">
                {rows.map((row) => {
                  const content = (
                    <>
                      <span className="font-mono text-xs uppercase tracking-label text-ink-fg underline decoration-ink-muted underline-offset-4 md:text-ink-muted md:no-underline">
                        {row.label}
                      </span>{' '}
                      <span className="sr-only text-ink-fg underline decoration-ink-muted underline-offset-4 transition-colors duration-200 group-hover:text-ink-accent group-hover:decoration-ink-accent md:not-sr-only">
                        {row.value}
                      </span>
                    </>
                  )
                  const channel = 'group inline-flex min-h-11 cursor-pointer items-baseline gap-3'
                  return (
                    <li key={row.key}>
                      {row.mail ? (
                        <button type="button" aria-haspopup="dialog" onClick={openForm} className={channel}>
                          {content}
                        </button>
                      ) : (
                        <a
                          href={row.href}
                          download={row.download || undefined}
                          type={row.download ? 'application/pdf' : undefined}
                          className={channel}
                        >
                          {content}
                        </a>
                      )}
                    </li>
                  )
                })}
                {contact.location ? (
                  <li className="inline-flex min-h-11 items-baseline gap-3">
                    <span className="hidden font-mono text-xs uppercase tracking-label text-ink-muted md:inline">
                      {t('content.contact.labels.location')}
                    </span>
                    <span className="text-sm text-ink-muted md:text-base md:text-ink-fg">{contact.location}</span>
                  </li>
                ) : null}
              </ul>
              <ContactDialog
                ref={dialog}
                buttonClassName="inline-flex min-h-11 shrink-0 cursor-pointer items-center self-start rounded-full bg-ink-fg px-6 text-sm font-medium text-ink transition-colors duration-200 hover:bg-ink-accent md:self-auto"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
