import { useTranslation } from 'react-i18next'
import { RevealItem } from '../components/RevealItem'
import { SectionShell } from '../components/SectionShell'
import { TagList } from '../components/TagList'
import { CERTIFICATIONS, EDUCATION, SKILL_GROUPS, SPOKEN_LANGUAGES } from '../content/skills'

const LABEL = 'font-mono text-sm uppercase tracking-label text-muted'

/** Skill groups as chip lists, then the credentials block (education, certifications, languages). */
export function Skills() {
  const { t } = useTranslation()

  return (
    <SectionShell id="skills">
      <div className="grid gap-x-8 gap-y-12 md:grid-cols-2">
        {SKILL_GROUPS.map((group) => (
          <RevealItem key={group.id}>
            <h3 id={`skills-${group.id}`} className={LABEL}>
              {t(`content.skills.groups.${group.id}`)}
            </h3>
            <TagList items={group.items} labelledBy={`skills-${group.id}`} size="md" className="mt-5" />
          </RevealItem>
        ))}
      </div>

      <RevealItem className="mt-16 border-t border-line pt-10 md:mt-24">
        <h3 className="text-title font-medium">{t('content.skills.credentials.title')}</h3>
        <div className="mt-8 grid gap-x-8 gap-y-10 md:grid-cols-3">
          <div>
            <h4 className={LABEL}>{t('content.skills.credentials.education.label')}</h4>
            <ul role="list" className="mt-5 flex flex-col gap-5">
              {EDUCATION.map((entry) => (
                <li key={entry.id}>
                  <p className="text-pretty">{t(`content.skills.credentials.education.${entry.id}`)}</p>
                  <p className="mt-2 text-sm text-muted">{entry.school}</p>
                  <p className="mt-1 font-mono text-sm text-muted">{entry.year}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className={LABEL}>{t('content.skills.credentials.certifications.label')}</h4>
            <ul role="list" className="mt-5 flex flex-col gap-3">
              {CERTIFICATIONS.map((certification) => (
                <li key={certification.id} className="text-pretty">
                  {certification.name}
                  {/* The locale owns its own punctuation and spacing: " (in progress)" in English,
                      full-width "（進行中）" with no leading space in Chinese. */}
                  {certification.inProgress ? (
                    <span className="text-muted">{t('content.skills.credentials.certifications.inProgress')}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className={LABEL}>{t('content.skills.credentials.languages.label')}</h4>
            <ul role="list" className="mt-5 flex flex-col gap-3">
              {SPOKEN_LANGUAGES.map((language) => (
                <li key={language}>{t(`content.skills.credentials.languages.${language}`)}</li>
              ))}
            </ul>
          </div>
        </div>
      </RevealItem>
    </SectionShell>
  )
}
