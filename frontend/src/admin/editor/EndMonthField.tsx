import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '../components/Checkbox'
import { TextControl } from '../components/TextControl'
import { getAt } from '../draft'
import type { EndField } from '../fields'
import { ADMIN_NS } from '../i18n'
import { LABEL } from '../styles'
import type { EditorApi } from './editorApi'

/**
 * An experience entry's end: a month, or none while "I work here now" is ticked (`end: null`,
 * shown as "Present" on the site). Unticking brings back the month that was there before.
 */
export function EndMonthField({ field, api }: { field: EndField; api: EditorApi }) {
  const { t } = useTranslation(ADMIN_NS)
  const end = getAt(api.draft, 'end')
  const current = end === null
  // The month typed before "current role" was ticked, restored when it is unticked again.
  const lastMonth = useRef(typeof end === 'string' ? end : '')

  return (
    <fieldset>
      <legend className={LABEL}>{t(`fields.${field.label}`)}</legend>
      <div className="mt-1">
        <Checkbox
          id={api.controlId('end-current')}
          label={t('fields.current')}
          checked={current}
          onChange={(checked) => api.update('end', checked ? null : lastMonth.current)}
          error={current ? api.error('end') : null}
        />
      </div>
      {current ? null : (
        <div className="mt-2">
          <TextControl
            id={api.controlId('end')}
            label={t('fields.endMonth')}
            control="month"
            value={typeof end === 'string' ? end : ''}
            onChange={(value) => {
              lastMonth.current = value
              api.update('end', value)
            }}
            error={api.error('end')}
            required
          />
        </div>
      )}
    </fieldset>
  )
}
