import { useTranslation } from 'react-i18next'
import { TextControl } from '../components/TextControl'
import { getString } from '../draft'
import { isRequired, localizedPath, type TextField } from '../fields'
import { ADMIN_NS } from '../i18n'
import { LOCALES } from '../schemas'
import { HINT, LABEL } from '../styles'
import type { EditorApi } from './editorApi'

/**
 * One translatable field: a group named after the field with an English and a Chinese control,
 * side by side from md up and stacked below. Each control declares its language, so spellcheck,
 * input methods and screen-reader pronunciation follow the text, not the admin language.
 */
export function LocalizedTextField({ field, api }: { field: TextField; api: EditorApi }) {
  const { t } = useTranslation(ADMIN_NS)
  const required = isRequired(field, api.draft)
  const hintId = field.hint ? `${api.controlId(field.name)}-hint` : undefined

  return (
    <fieldset aria-describedby={hintId}>
      <legend className={LABEL}>
        {t(`fields.${field.label}`)}
        {required ? null : (
          <>
            {' '}
            <span className="text-muted">{t('fields.optional')}</span>
          </>
        )}
      </legend>
      {field.hint ? (
        <p id={hintId} className={`mt-1 ${HINT}`}>
          {t(`hints.${field.hint}`)}
        </p>
      ) : null}
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {LOCALES.map((locale) => {
          const path = localizedPath(locale, field.name)
          return (
            <TextControl
              key={locale}
              id={api.controlId(path)}
              label={t(`locale.${locale}`)}
              subLabel
              lang={locale}
              control={field.control}
              rows={field.control === 'textarea' ? 6 : undefined}
              value={getString(api.draft, path)}
              onChange={(value) => api.update(path, value)}
              error={api.error(path)}
              required={required}
            />
          )
        })}
      </div>
    </fieldset>
  )
}
