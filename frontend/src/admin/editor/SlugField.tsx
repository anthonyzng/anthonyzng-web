import { useTranslation } from 'react-i18next'
import { TextControl } from '../components/TextControl'
import { getString } from '../draft'
import type { SlugField as SlugFieldConfig } from '../fields'
import { ADMIN_NS } from '../i18n'
import { HINT, LABEL } from '../styles'
import type { EditorApi } from './editorApi'

/**
 * The row's id. On create it is suggested from the English title (or company, school, name)
 * until typed by hand; once saved it is fixed, because the site and the URLs refer to it.
 */
export function SlugField({ field, api }: { field: SlugFieldConfig; api: EditorApi }) {
  const { t } = useTranslation(ADMIN_NS)
  const slug = getString(api.draft, 'slug')
  const label = t(`fields.${field.label}`)

  if (api.mode === 'edit') {
    return (
      <div>
        <p className={LABEL}>{label}</p>
        <p className="mt-2 font-mono text-sm wrap-anywhere">{slug}</p>
        <p className={`mt-1 ${HINT}`}>{t('hints.slugFixed')}</p>
      </div>
    )
  }

  return (
    <TextControl
      id={api.controlId('slug')}
      label={label}
      hint={t(field.source ? 'hints.slugSuggested' : 'hints.slug')}
      value={slug}
      onChange={api.editSlug}
      error={api.error('slug')}
      required
      code
    />
  )
}
