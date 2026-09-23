import { useTranslation } from 'react-i18next'
import { ContactForm } from '../components/ContactForm'
import { RevealItem } from '../components/RevealItem'
import { SectionShell } from '../components/SectionShell'
import { useResolvedContent } from '../content/contentContext'

interface ContactRow {
  id: string
  label: string
  /** Shown verbatim: an address or a handle, never a translated string. */
  value: string
  href: string | null
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
 * The closing beat, with a display-size heading: the direct channels first, then the form.
 * Channels and location arrive resolved for the active locale; the "Based in" row is dropped when
 * the location is unset rather than shown empty.
 */
export function Contact() {
  const { t } = useTranslation()
  const { contact } = useResolvedContent()

  const rows: ContactRow[] = [
    ...contact.links.map((link) => ({ id: link.id, label: link.label, value: link.display, href: link.href })),
    ...(contact.location
      ? [{ id: 'location', label: t('content.contact.labels.location'), value: contact.location, href: null }]
      : []),
  ]

  return (
    <SectionShell id="contact" headingSize="display">
      <div className="max-w-3xl">
        {/* A list, not a <dl>: a definition list may not nest the reveal wrapper between its div and its dt. */}
        <ul role="list" className="flex flex-col">
          {rows.map((row) => (
            <li key={row.id}>
              <RevealItem className="border-t border-line">
                <div className="grid gap-2 py-6 md:grid-cols-12 md:items-baseline md:gap-8">
                  <p className="font-mono text-sm uppercase tracking-label text-muted md:col-span-4">{row.label}</p>
                  <p className="text-xl font-medium md:col-span-8 md:text-title">
                    {row.href ? (
                      <a href={row.href} className={VALUE_LINK}>
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
