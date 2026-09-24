import { useTranslation } from 'react-i18next'
import { Checkbox } from '../components/Checkbox'
import { TextControl } from '../components/TextControl'
import { getBoolean, getString } from '../draft'
import { isRequired, isVisible, type FieldConfig } from '../fields'
import { ADMIN_NS } from '../i18n'
import { BulletsEditor } from './BulletsEditor'
import type { EditorApi } from './editorApi'
import { EndMonthField } from './EndMonthField'
import { LocalizedTextField } from './LocalizedTextField'
import { SlugField } from './SlugField'
import { TagListEditor } from './TagListEditor'

/** Renders one field config (collections.ts) with the matching control; hidden fields render nothing. */
export function EditorField({ field, api }: { field: FieldConfig; api: EditorApi }) {
  const { t } = useTranslation(ADMIN_NS)
  if (!isVisible(field, api.draft)) return null
  const hint = field.hint ? t(`hints.${field.hint}`) : null

  switch (field.kind) {
    case 'slug':
      return <SlugField field={field} api={api} />
    case 'text': {
      if (field.localized) return <LocalizedTextField field={field} api={api} />
      const required = isRequired(field, api.draft)
      return (
        <TextControl
          id={api.controlId(field.name)}
          label={t(`fields.${field.label}`)}
          hint={hint}
          control={field.control}
          value={getString(api.draft, field.name)}
          onChange={(value) => api.update(field.name, value)}
          error={api.error(field.name)}
          required={required}
          optional={!required}
          code={field.control === 'url'}
        />
      )
    }
    case 'boolean':
      return (
        <Checkbox
          id={api.controlId(field.name)}
          label={t(`fields.${field.label}`)}
          hint={hint}
          checked={getBoolean(api.draft, field.name)}
          onChange={(checked) => api.update(field.name, checked)}
          error={api.error(field.name)}
        />
      )
    case 'end':
      return <EndMonthField field={field} api={api} />
    case 'tags':
      return <TagListEditor field={field} api={api} />
    case 'bullets':
      return <BulletsEditor field={field} api={api} />
  }
}
