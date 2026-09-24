import { useTranslation } from 'react-i18next'
import { Checkbox } from '../components/Checkbox'
import { Icon } from '../components/Icon'
import { TextControl } from '../components/TextControl'
import { getTags, isTermTag, swapped } from '../draft'
import type { TagsField } from '../fields'
import { usePendingFocus } from '../hooks/usePendingFocus'
import { ADMIN_NS } from '../i18n'
import { LOCALES, type Tag } from '../schemas'
import { ERROR_TEXT, HINT, LABEL, SECONDARY_BUTTON } from '../styles'
import type { EditorApi } from './editorApi'
import { RowActions, type RowAction } from './RowActions'

const emptyTerm = (): Tag => ({ en: '', 'zh-Hant': '' })

/**
 * A list of chips (a role's technologies, a skill group's items). A chip is a proper noun, shown
 * as typed in both languages, or a translated term with English and Chinese text; a checkbox
 * switches between the two. Chips can be added, removed and reordered; after each change focus
 * stays with the chip (or the nearest control) and the live region says what happened.
 */
export function TagListEditor({ field, api }: { field: TagsField; api: EditorApi }) {
  const { t } = useTranslation(ADMIN_NS)
  const tags = getTags(api.draft, field.name)
  const baseId = api.controlId(field.name)
  const hintId = field.hint ? `${baseId}-hint` : null
  const listError = api.error(field.name)
  const listErrorId = listError ? `${baseId}-error` : null
  const full = tags.length >= field.max
  // After a change re-renders the list, focus goes where the change left the user.
  const focusAfterRender = usePendingFocus()

  const rowPath = (index: number) => `${field.name}.${index}`
  const firstInputId = (index: number, tag: Tag) =>
    api.controlId(isTermTag(tag) ? `${rowPath(index)}.en` : rowPath(index))

  const add = (tag: Tag) => {
    if (full) return
    api.update(field.name, [...tags, tag])
    focusAfterRender(firstInputId(tags.length, tag))
  }

  const act = (index: number, action: RowAction) => {
    if (action === 'remove') {
      const next = tags.filter((_, position) => position !== index)
      api.update(field.name, next)
      api.announce(t('rows.removed', { row: t('tags.chip', { position: index + 1 }) }))
      focusAfterRender(
        next.length === 0 ? `${baseId}-add-noun` : `${api.controlId(rowPath(Math.min(index, next.length - 1)))}-row-remove`,
      )
      return
    }
    const target = action === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= tags.length) return
    api.update(field.name, swapped(tags, index, target))
    api.announce(t('rows.moved', { position: target + 1, total: tags.length }))
    focusAfterRender(`${api.controlId(rowPath(target))}-row-${action}`)
  }

  const setKind = (index: number, term: boolean) => {
    const tag = tags[index]
    if (term === isTermTag(tag)) return
    api.update(rowPath(index), isTermTag(tag) ? tag.en : { en: tag, 'zh-Hant': '' })
  }

  return (
    <fieldset aria-describedby={[hintId, listErrorId].filter(Boolean).join(' ') || undefined}>
      <legend className={LABEL}>
        {t(`fields.${field.label}`)}
        {field.min === 0 ? (
          <>
            {' '}
            <span className="text-muted">{t('fields.optional')}</span>
          </>
        ) : null}
      </legend>
      {field.hint ? (
        <p id={hintId ?? undefined} className={`mt-1 ${HINT}`}>
          {t(`hints.${field.hint}`)}
        </p>
      ) : null}
      {listError ? (
        <p id={listErrorId ?? undefined} className={`mt-1 ${ERROR_TEXT}`}>
          {listError}
        </p>
      ) : null}

      {tags.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('tags.empty')}</p>
      ) : (
        <ol role="list" className="mt-3 flex flex-col gap-3">
          {tags.map((tag, index) => {
            const path = rowPath(index)
            const rowId = api.controlId(path)
            const rowName = t('tags.chip', { position: index + 1 })
            return (
              // Index keys: rows are positions; focus is moved explicitly after every change.
              <li key={index}>
                <div role="group" aria-labelledby={`${rowId}-label`} className="border border-line px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span id={`${rowId}-label`} className="font-mono text-xs uppercase tracking-label text-muted">
                      {rowName}
                    </span>
                    <RowActions
                      idPrefix={`${rowId}-row`}
                      rowName={rowName}
                      isFirst={index === 0}
                      isLast={index === tags.length - 1}
                      canRemove
                      onAction={(action) => act(index, action)}
                    />
                  </div>
                  <Checkbox
                    id={`${rowId}-term`}
                    label={t('tags.translated')}
                    checked={isTermTag(tag)}
                    onChange={(checked) => setKind(index, checked)}
                  />
                  {isTermTag(tag) ? (
                    <div className="mt-1 grid gap-3 md:grid-cols-2">
                      {LOCALES.map((locale) => (
                        <TextControl
                          key={locale}
                          id={api.controlId(`${path}.${locale}`)}
                          label={t(`locale.${locale}`)}
                          subLabel
                          lang={locale}
                          value={tag[locale]}
                          onChange={(value) => api.update(`${path}.${locale}`, value)}
                          // A rejection of the whole chip is shown on its first control.
                          error={api.error(`${path}.${locale}`) ?? (locale === 'en' ? api.error(path) : null)}
                          required
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1">
                      <TextControl
                        id={rowId}
                        label={t('tags.text')}
                        subLabel
                        value={tag}
                        onChange={(value) => api.update(path, value)}
                        error={api.error(path)}
                        required
                      />
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {/* An error about the whole list (too few or too many chips) has no text box to sit on: this
            button carries it, so a failed save moves focus here and the error is read with it. */}
        <button
          id={`${baseId}-add-noun`}
          type="button"
          aria-disabled={full || undefined}
          aria-invalid={listError ? true : undefined}
          aria-describedby={listErrorId ?? undefined}
          onClick={() => add('')}
          className={SECONDARY_BUTTON}
        >
          <Icon name="plus" />
          {t('tags.addNoun')}
        </button>
        <button
          id={`${baseId}-add-term`}
          type="button"
          aria-disabled={full || undefined}
          onClick={() => add(emptyTerm())}
          className={SECONDARY_BUTTON}
        >
          <Icon name="plus" />
          {t('tags.addTerm')}
        </button>
      </div>
      {full ? <p className={`mt-2 ${HINT}`}>{t('tags.full', { max: field.max })}</p> : null}
    </fieldset>
  )
}
