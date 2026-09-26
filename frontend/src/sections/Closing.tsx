import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { fileUrl } from '../api/files'
import { useMotionAllowed } from '../animations/useMotionAllowed'
import { useZipperLoop } from '../animations/useZipperLoop'
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
}

/**
 * The closing screen after Contact: the page fades into ink, "Get in touch" sits in the middle, and
 * the channels (and the CV, once uploaded) loop past it, each row parting around the title like a
 * zipper (`useZipperLoop`). It repeats what the Contact section already offers, so it is decorative:
 * hidden from assistive technology, its links out of the tab order (a pointer can still use them).
 * Without motion it is one still screen: the title, then each channel once.
 */
export function Closing() {
  const { t, i18n } = useTranslation()
  const { contact, cv } = useResolvedContent()
  const motion = useMotionAllowed()
  const scope = useRef<HTMLElement>(null)

  const rows: Row[] = [
    ...contact.links.map((link) => ({ key: link.id, label: link.label, value: link.display, href: link.href })),
    ...(cv
      ? [
          {
            key: 'cv',
            label: t('content.contact.labels.cv'),
            value: t('content.contact.cvDownload', { size: formatFileSize(cv.size, i18n.language) }),
            href: fileUrl(cv.url),
            download: true,
          },
        ]
      : []),
  ]
  const copies = motion ? LOOP_COPIES : 1
  // The language too: the title's width sets how far the rows part.
  useZipperLoop(scope, `${rows.map((row) => row.key).join()}:${copies}:${i18n.language}`)

  const list = Array.from({ length: copies }, (_, copy) =>
    rows.map((row) => (
      <a
        key={`${copy}-${row.key}`}
        data-zipper-row
        href={row.href}
        download={row.download || undefined}
        tabIndex={-1}
        className="group grid h-24 grid-cols-2 items-center gap-x-6 md:h-28"
      >
        <span data-zipper-label className="justify-self-end font-mono text-xs uppercase tracking-label text-ink-muted md:text-sm">
          {row.label}
        </span>
        <span
          data-zipper-value
          className="justify-self-start whitespace-nowrap text-lg text-ink-fg transition-colors duration-200 group-hover:text-ink-accent md:text-2xl"
        >
          {row.value}
        </span>
      </a>
    )),
  )

  return (
    <section ref={scope} data-closing aria-hidden="true" className={motion ? 'relative h-[260svh]' : 'relative'}>
      {/* The page washes into ink before the screen arrives. */}
      <div className="h-[40svh] bg-linear-to-b from-bg to-ink" />
      <div
        data-zipper-screen
        className={`${motion ? 'sticky top-0 h-svh' : 'min-h-svh'} overflow-hidden bg-ink text-ink-fg`}
      >
        {motion ? (
          <>
            <div className="absolute inset-x-0 top-0 flex flex-col">{list}</div>
            <p data-zipper-title className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="text-title font-medium md:text-headline">{t('home.closing.title')}</span>
            </p>
          </>
        ) : (
          <div className="flex min-h-svh flex-col items-center justify-center gap-10 px-5 py-24">
            <p className="text-title font-medium md:text-headline">{t('home.closing.title')}</p>
            <div className="flex w-full flex-col">{list}</div>
          </div>
        )}
      </div>
    </section>
  )
}
