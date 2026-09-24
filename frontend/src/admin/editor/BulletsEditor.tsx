import { useTranslation } from 'react-i18next'
import { Icon } from '../components/Icon'
import { TextControl } from '../components/TextControl'
import { getStrings, swapped } from '../draft'
import { bulletsPath, type BulletsField } from '../fields'
import { usePendingFocus } from '../hooks/usePendingFocus'
import { ADMIN_NS } from '../i18n'
import { LOCALES } from '../schemas'
import { ERROR_TEXT, HINT, LABEL, SECONDARY_BUTTON } from '../styles'
import type { EditorApi } from './editorApi'
import { RowActions, type RowAction } from './RowActions'

/**
 * Experience bullets as paired rows: each row holds the English and the Chinese version of one
 * bullet, so adding, removing or moving a row changes both lists together and the two locales
 * always have the same number of bullets (the backend rejects anything else).
 */
export function BulletsEditor({ field, api }: { field: BulletsField; api: EditorApi }) {
  const { t } = useTranslation(ADMIN_NS)
  const en = getStrings(api.draft, bulletsPath('en'))
  const zh = getStrings(api.draft, bulletsPath('zh-Hant'))
  const count = Math.max(en.length, zh.length)
  const baseId = api.controlId('bullets')
  const hintId = field.hint ? `${baseId}-hint` : null
  const listErrors = LOCALES.map((locale) => api.error(bulletsPath(locale))).filter((error) => error !== null)
  const listErrorId = listErrors.length > 0 ? `${baseId}-error` : null
  const focusAfterRender = usePendingFocus()

  const cellPath = (locale: 'en' | 'zh-Hant', index: number) => `${bulletsPath(locale)}.${index}`
  const rowPrefix = (index: number) => `${baseId}-${index}-row`
  const pad = (list: readonly string[]) => Array.from({ length: count }, (_, index) => list[index] ?? '')
  const commit = (nextEn: string[], nextZh: string[]) =>
    api.updateMany([
      [bulletsPath('en'), nextEn],
      [bulletsPath('zh-Hant'), nextZh],
    ])

  const add = () => {
    if (count >= field.max) return
    commit([...pad(en), ''], [...pad(zh), ''])
    focusAfterRender(api.controlId(cellPath('en', count)))
  }

  const act = (index: number, action: RowAction) => {
    if (action === 'remove') {
      if (count <= field.min) return
      const without = (list: readonly string[]) => pad(list).filter((_, position) => position !== index)
      commit(without(en), without(zh))
      api.announce(t('rows.removed', { row: t('bullets.row', { position: index + 1 }) }))
      focusAfterRender(`${rowPrefix(Math.min(index, count - 2))}-remove`)
      return
    }
    const target = action === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= count) return
    commit(swapped(pad(en), index, target), swapped(pad(zh), index, target))
    api.announce(t('rows.moved', { position: target + 1, total: count }))
    focusAfterRender(`${rowPrefix(target)}-${action}`)
  }

  return (
    <fieldset aria-describedby={[hintId, listErrorId].filter(Boolean).join(' ') || undefined}>
      <legend className={LABEL}>{t(`fields.${field.label}`)}</legend>
      {field.hint ? (
        <p id={hintId ?? undefined} className={`mt-1 ${HINT}`}>
          {t(`hints.${field.hint}`, { min: field.min, max: field.max })}
        </p>
      ) : null}
      {listErrors.length > 0 ? (
        <div id={listErrorId ?? undefined} className={`mt-1 ${ERROR_TEXT}`}>
          {listErrors.map((error, index) => (
            <p key={index}>{error}</p>
          ))}
        </div>
      ) : null}

      <ol role="list" className="mt-3 flex flex-col gap-3">
        {Array.from({ length: count }, (_, index) => {
          const rowName = t('bullets.row', { position: index + 1 })
          const labelId = `${baseId}-${index}-label`
          return (
            <li key={index}>
              <div role="group" aria-labelledby={labelId} className="border border-line px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span id={labelId} className="font-mono text-xs uppercase tracking-label text-muted">
                    {rowName}
                  </span>
                  <RowActions
                    idPrefix={rowPrefix(index)}
                    rowName={rowName}
                    isFirst={index === 0}
                    isLast={index === count - 1}
                    canRemove={count > field.min}
                    onAction={(action) => act(index, action)}
                  />
                </div>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  {LOCALES.map((locale) => {
                    const path = cellPath(locale, index)
                    return (
                      <TextControl
                        key={locale}
                        id={api.controlId(path)}
                        label={t(`locale.${locale}`)}
                        subLabel
                        lang={locale}
                        control="textarea"
                        rows={3}
                        value={(locale === 'en' ? en : zh)[index] ?? ''}
                        onChange={(value) => api.update(path, value)}
                        error={api.error(path)}
                        required
                      />
                    )
                  })}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {/* A list-level error (a locale's bullets as a whole) is carried by this button, like the chips' one. */}
      <button
        id={`${baseId}-add`}
        type="button"
        aria-disabled={count >= field.max || undefined}
        aria-invalid={listErrorId ? true : undefined}
        aria-describedby={listErrorId ?? undefined}
        onClick={add}
        className={`mt-3 ${SECONDARY_BUTTON}`}
      >
        <Icon name="plus" />
        {t('bullets.add')}
      </button>
    </fieldset>
  )
}
