import { useTranslation } from 'react-i18next'
import { fileUrl } from '../api/files'
import { ContactForm } from '../components/ContactForm'
import { RevealItem } from '../components/RevealItem'
import { SectionShell } from '../components/SectionShell'
import { useResolvedContent } from '../content/contentContext'
import { formatFileSize } from '../i18n/formatFileSize'

interface ContactRow {
  /** React key: link rows are prefixed, so a link slug can never collide with the fixed rows. */
  key: string
  label: string
  /** A channel's address or handle verbatim, the location, or the CV download label. */
  value: string
  href: string | null
  /** The CV: a PDF the server sends as an attachment. */
  download?: boolean
}

/**
 * A contact value that is a link. It must be perceivable as one next to the plain "Based in" row
 * (WCAG 1.4.1), so it carries both accent colour and an underline drawn in a colour with real
 * contrast; an underline drawn in the hairline rule colour would be invisible in either theme.
 * Hover only deepens it, so touch users (who never hover) are served by the resting state.
 */
const VALUE_LINK =
  'inline-flex min-h-11 items-center wrap-anywhere text-accent underline decoration-muted underline-offset-8 ' +
  'transition-colors duration-200 hover:decoration-accent'

/**
 * The closing beat, with a display-size heading: the direct channels first, then the CV download
 * and the location, then the form. Channels and location arrive resolved for the active locale; the
 * CV row appears only once a CV is uploaded, and the "Based in" row is dropped when the location is
 * unset rather than shown empty.
 */
export function Contact() {
  const { t, i18n } = useTranslation()
  const { contact, cv } = useResolvedContent()

  const rows: ContactRow[] = [
    ...contact.links.map((link) => ({ key: `link-${link.id}`, label: link.label, value: link.display, href: link.href })),
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
    ...(contact.location
      ? [{ key: 'location', label: t('content.contact.labels.location'), value: contact.location, href: null }]
      : []),
  ]

  return (
    <SectionShell id="contact" headingSize="display" motionKey={rows.map((row) => row.key).join()}>
      <div className="max-w-3xl">
        {/* A list, not a <dl>: a definition list may not nest the reveal wrapper between its div and its dt. */}
        <ul role="list" className="flex flex-col">
          {rows.map((row) => (
            <li key={row.key}>
              <RevealItem className="border-t border-line">
                <div className="grid gap-2 py-6 md:grid-cols-12 md:items-baseline md:gap-8">
                  <p className="font-mono text-sm uppercase tracking-label text-muted md:col-span-4">{row.label}</p>
                  <p className="text-xl font-medium md:col-span-8 md:text-title">
                    {row.href ? (
                      <a
                        href={row.href}
                        className={VALUE_LINK}
                        download={row.download || undefined}
                        type={row.download ? 'application/pdf' : undefined}
                      >
                        {row.value}
                      </a>
                    ) : (
                      row.value
                    )}
                  </p>
                </div>
              </RevealItem>
            </li>
          ))}
        </ul>

        <RevealItem className="mt-14 border-t border-line pt-10 md:mt-20">
          <ContactForm />
        </RevealItem>
      </div>
    </SectionShell>
  )
}
