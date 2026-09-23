import { useTranslation } from 'react-i18next'
import { RevealItem } from '../components/RevealItem'
import { SectionShell } from '../components/SectionShell'
import { TagList } from '../components/TagList'
import { EXPERIENCE } from '../content/experience'
import { formatMonth } from '../i18n/formatMonth'

/**
 * The work timeline, newest first: one reveal per role, dates and place in the left column, the role
 * itself in the right one. `RevealItem`'s outer div is the untransformed trigger, so the rule that
 * separates the entries lives there and never moves with the reveal.
 *
 * Dates are stored as `YYYY-MM` and formatted per locale, so the Chinese page never shows English
 * month names and `<time datetime>` always carries the same date the label shows.
 */
export function Experience() {
  const { t, i18n } = useTranslation()

  return (
    <SectionShell id="experience">
      {/* role="list": Tailwind's preflight drops the markers, and WebKit then drops list semantics. */}
      <ol role="list" className="flex flex-col">
        {EXPERIENCE.map((entry) => {
          const base = `content.experience.${entry.id}`
          // The rule and the spacing sit on the <li>: `last:` must see the list, and RevealItem's
          // outer div is an only child, so there it would match every entry.
          return (
            <li key={entry.id} className="border-t border-line pt-8 pb-14 last:pb-0 md:pt-10">
              <RevealItem>
                <article className="grid gap-x-8 gap-y-5 md:grid-cols-12">
                  <div className="md:col-span-4">
                    <p className="font-mono text-sm text-muted">
                      <time dateTime={entry.start}>{formatMonth(entry.start, i18n.language)}</time>
                      <span>{' – '}</span>
                      {entry.end ? (
                        <time dateTime={entry.end}>{formatMonth(entry.end, i18n.language)}</time>
                      ) : (
                        <span>{t('content.experience.present')}</span>
                      )}
                    </p>
                    <p className="mt-3 text-sm text-muted">{t(`${base}.location`)}</p>
                  </div>

                  <div className="md:col-span-8">
                    <h3 className="text-title font-medium text-balance">{t(`${base}.role`)}</h3>
                    <p className="mt-2 font-mono text-sm text-accent">{entry.company}</p>

                    <ul role="list" className="mt-7 flex flex-col gap-4 text-muted">
                      {entry.bullets.map((bullet) => (
                        <li key={bullet} className="grid grid-cols-[auto_1fr] gap-3">
                          <span aria-hidden="true" className="font-mono text-accent">
                            /
                          </span>
                          <span className="text-pretty">{t(`${base}.bullets.${bullet}`)}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Named after its employer: three lists called "Technologies" would be
                        indistinguishable in a screen reader's list rotor. */}
                    <TagList
                      items={entry.tech}
                      label={t('content.techOf', { name: entry.company })}
                      className="mt-7"
                    />
                  </div>
                </article>
              </RevealItem>
            </li>
          )
        })}
      </ol>
    </SectionShell>
  )
}
