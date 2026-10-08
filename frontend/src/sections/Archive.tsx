import { useTranslation } from 'react-i18next'
import { useResolvedContent } from '../content/contentContext'
import { formatMonth } from '../i18n/formatMonth'
import { ARCHIVE_ID } from './sectionIds'

/**
 * The epilogue after the closing screen: earlier versions of the portfolio, blog posts and other
 * links, one quiet row each (month, kind, title and an optional line), on the same backdrop as the
 * screen above. Each row opens its link in a new tab. No nav link and no number: it is the least
 * of the page, and it is left out entirely while the admin panel lists nothing.
 */
export function Archive() {
  const { t, i18n } = useTranslation()
  const { archive } = useResolvedContent()
  if (archive.length === 0) return null

  return (
    <section id={ARCHIVE_ID} aria-labelledby="archive-title" className="text-fg">
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-8 sm:px-8 md:pb-32">
        <div className="grid gap-y-3 md:grid-cols-12 md:gap-x-8">
          {/* tabIndex -1: the focus target after anchor navigation, like every section heading. */}
          <h2 id="archive-title" tabIndex={-1} className="text-title font-medium outline-none md:col-span-4">
            {t('home.archive.title')}
          </h2>
          <p className="text-muted md:col-span-8 md:pt-1">{t('home.archive.tagline')}</p>
        </div>

        <ul role="list" className="mt-10 border-t border-line md:mt-14">
          {archive.map((entry) => {
            const row = (
              <>
                <time dateTime={entry.month} className="font-mono text-sm tabular-nums text-muted md:col-span-2">
                  {formatMonth(entry.month, i18n.language)}
                </time>{' '}
                <span className="font-mono text-xs uppercase tracking-label text-accent md:col-span-2">{entry.kind}</span>{' '}
                <span className="md:col-span-7">
                  <span className="text-lg text-fg transition-colors duration-200 group-hover:text-accent">
                    {entry.title}
                  </span>
                  {entry.summary ? ' ' : null}
                  {entry.summary ? <span className="mt-1 block text-sm text-muted">{entry.summary}</span> : null}
                </span>
              </>
            )
            const layout = 'grid gap-x-8 gap-y-1 py-6 md:grid-cols-12 md:items-baseline'
            return (
              <li key={entry.id} className="border-b border-line">
                {entry.url ? (
                  <a href={entry.url} target="_blank" rel="noopener noreferrer" className={`group ${layout}`}>
                    {row}
                    <span
                      aria-hidden="true"
                      className="hidden justify-self-end font-mono text-muted transition duration-300 ease-out-expo group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-accent motion-reduce:transition-none md:col-span-1 md:block"
                    >
                      ↗
                    </span>{' '}
                    <span className="sr-only">{t('common.newTab')}</span>
                  </a>
                ) : (
                  <div className={layout}>{row}</div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
