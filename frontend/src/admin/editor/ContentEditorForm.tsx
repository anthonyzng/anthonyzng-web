import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ApiHttpError, isAbortError } from '../../api/client'
import { createItem, isChangedElsewhere, isUnauthorized, listItems, updateItem } from '../api'
import type { Collection, ContentItem } from '../collections'
import { AdminLink } from '../components/AdminLink'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { pageHeading } from '../dom'
import { getString, sameDraft, setAt, type Draft, type Json } from '../draft'
import { clearDraft, readDraft, writeDraft } from '../draftStore'
import { useConfirmedAction } from '../hooks/useConfirmedAction'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { ADMIN_NS } from '../i18n'
import { adminPaths } from '../paths'
import type { ImageRef, ProjectItem } from '../schemas'
import { useSession } from '../session/sessionContext'
import { useStatus } from '../shell/statusContext'
import { slugify } from '../slugify'
import { PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_LINK } from '../styles'
import { errorSlots, fieldErrorText, mapServerFields, validateDraft, type FieldErrors } from '../validation'
import type { EditorApi } from './editorApi'
import { EditorField } from './EditorField'
import { ProjectImageSection } from './ProjectImageSection'

interface ContentEditorFormProps {
  collection: Collection
  /**
   * The row as the server has it, or null for a new one: loaded first, then replaced by every
   * answer (a save the form stays on, the latest version after a conflict; an image change replaces
   * only its `image`). Its `updatedAt` is the version a save must match (If-Match) and a kept draft
   * refers to.
   */
  item: ContentItem | null
  /** The whole collection: slug uniqueness on create comes from it. */
  items: readonly ContentItem[]
  /** The server answered with a newer version of the row. */
  onRowChange(row: ContentItem): void
  /**
   * A project's cover image changed. Only the image is taken over, applied to the row as it is
   * when the answer lands (an upload may outlive a save or a "load latest version"): the server
   * keeps the content version for image changes, and a change saved elsewhere meanwhile must
   * still be refused (412) on save, never adopted as the form's baseline.
   */
  onImageChange(image: ImageRef | null): void
}

/** A form-level message. `field` is a server key that matches no control, shown as code after the text. */
interface FormError {
  text: string
  field?: string
}

/** Without the errors at `path` and below it. */
function clearErrors(errors: FieldErrors, paths: readonly string[]): FieldErrors {
  const stale = (key: string) => paths.some((path) => key === path || key.startsWith(`${path}.`))
  if (!Object.keys(errors).some(stale)) return errors
  return Object.fromEntries(Object.entries(errors).filter(([key]) => !stale(key)))
}

/**
 * The create / edit form, driven by the collection's field configs. Checks run before sending (the
 * same rules as the backend); a 422 is mapped onto the named controls with a localized message (a
 * `body` key or a key that matches no control becomes a form-level error above the form), a 409
 * lands on the slug. The payload is the write shape only: the order (`sortOrder`, which the server
 * owns) and the read-only keys (`updatedAt`, `image`) are never sent. An edit is sent with If-Match:
 * a row saved elsewhere since is refused (412), the changes stay, and the latest version can be
 * loaded in their place. A save returns to the list, which announces it, unless the user typed on
 * while it was on its way: then the form stays, on the version just saved, with that typing kept.
 * Leaving with unsaved changes asks first, and the draft is kept for the tab (draftStore), so an
 * expired session or a Back does not lose the typing.
 */
export function ContentEditorForm({ collection, item, items, onRowChange, onImageChange }: ContentEditorFormProps) {
  const { t } = useTranslation(ADMIN_NS)
  const navigate = useNavigate()
  const { expire } = useSession()
  const { announce } = useStatus()
  const mode = item === null ? 'create' : 'edit'
  const formId = useId()
  const draftId = `${collection.id}/${item?.slug ?? 'new'}`
  // What the server has: the form compares against it (unsaved changes) and follows it when it moves on.
  const initial = useMemo<Draft>(() => (item === null ? collection.emptyDraft() : collection.toDraft(item)), [collection, item])
  const base = item?.updatedAt ?? null
  const project = collection.id === 'projects' ? (item as ProjectItem | null) : null
  const image = project?.image ?? null
  const slugSource = collection.fields.find((field) => field.kind === 'slug')?.source ?? null
  // A kept draft of this row comes back; `stale` when the row was saved elsewhere since it started.
  const [restored, setRestored] = useState<{ draft: Draft; stale: boolean } | null>(() => {
    const kept = readDraft(draftId, initial)
    return kept && !sameDraft(kept.draft, initial) ? { draft: kept.draft, stale: kept.base !== base } : null
  })
  const [draft, setDraft] = useState<Draft>(() => restored?.draft ?? initial)
  // A restored slug that differs from its suggestion was typed by hand: it must not be overwritten.
  const [slugEdited, setSlugEdited] = useState(
    () =>
      restored !== null &&
      slugSource !== null &&
      getString(restored.draft, 'slug') !== slugify(getString(restored.draft, slugSource)),
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formErrors, setFormErrors] = useState<FormError[]>([])
  // The last save was refused because the row changed elsewhere: the latest version can be loaded.
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const formErrorRef = useRef<HTMLDivElement>(null)
  const request = useRef<AbortController | null>(null)
  // The draft as last rendered: a save compares it with what it sent, to find typing made meanwhile.
  const latestDraft = useRef(draft)
  const dirty = !sameDraft(draft, initial)

  useUnsavedChanges(dirty, () => clearDraft(draftId))

  useEffect(() => {
    latestDraft.current = draft
  }, [draft])

  // The draft follows every change while it differs from the saved row.
  useEffect(() => {
    if (dirty) writeDraft(draftId, draft, base)
    else clearDraft(draftId)
  }, [dirty, draft, draftId, base])

  useEffect(() => () => request.current?.abort(), [])

  const discardRestored = () => {
    setDraft(initial)
    setSlugEdited(false)
    setErrors({})
    setFormErrors([])
    setRestored(null)
    announce(t('editor.restoredDiscarded'))
    pageHeading()?.focus() // the button that was pressed goes away with the notice
  }

  // After a failed save: the form-level box when there is one, else the first invalid control.
  useEffect(() => {
    if (focusRequest === 0) return
    if (formErrorRef.current) formErrorRef.current.focus()
    else formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusRequest])

  const apply = (entries: readonly (readonly [string, Json])[]) => {
    setDraft((current) => {
      let next = current
      for (const [path, value] of entries) {
        next = setAt(next, path, value)
        // Until the slug is typed by hand it follows its source (company, English title, ...).
        if (mode === 'create' && !slugEdited && path === slugSource && typeof value === 'string') {
          next = setAt(next, 'slug', slugify(value))
        }
      }
      return next
    })
    const touched = entries.map(([path]) => path)
    if (mode === 'create' && !slugEdited && slugSource !== null && touched.includes(slugSource)) touched.push('slug')
    setErrors((current) => clearErrors(current, touched))
  }

  const api: EditorApi = {
    draft,
    mode,
    update: (path, value) => apply([[path, value]]),
    updateMany: apply,
    editSlug: (value) => {
      // Emptied by hand: the suggestion takes over again with the next change to its source.
      setSlugEdited(value !== '')
      setDraft((current) => setAt(current, 'slug', value))
      setErrors((current) => clearErrors(current, ['slug']))
    },
    controlId: (path) => `${formId}-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
    error: (path) => {
      const error = errors[path]
      return error ? fieldErrorText(error, t) : null
    },
    announce: (text) => announce(text),
  }

  const failed = (field: FieldErrors, form: FormError[]) => {
    setErrors(field)
    setFormErrors(form)
    announce(t('editor.notSaved'), 'error')
    setFocusRequest((current) => current + 1)
  }

  /**
   * Saved, but the user typed on while the save was on its way: that typing must not be lost. An
   * edit stays on the page, on the version just saved (the next save matches it); a new row moves
   * to its own edit page (the create form would post it a second time), where the typing comes back
   * as its kept draft.
   */
  const keepNewerChanges = (saved: ContentItem, newer: Draft, title: string) => {
    if (item === null) {
      const edit = adminPaths.edit(collection.id, saved.slug)
      // The slug is fixed from now on: the one the row was created with.
      writeDraft(`${collection.id}/${saved.slug}`, setAt(newer, 'slug', saved.slug), saved.updatedAt)
      clearDraft(draftId)
      announce(t('editor.savedNewer', { title }), 'success', { at: edit })
      void navigate(edit, { replace: true })
      return
    }
    onRowChange(saved)
    setRestored(null)
    setSaving(false)
    announce(t('editor.savedNewer', { title }), 'success')
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    const found = validateDraft(collection, draft, {
      mode,
      existingSlugs: items.map((row) => row.slug),
      image,
    })
    if (Object.keys(found).length > 0) {
      failed(found, [])
      return
    }

    setErrors({})
    setFormErrors([])
    setConflict(false)
    setSaving(true)
    announce(t('editor.saving'))
    const controller = new AbortController()
    request.current = controller
    const sent = draft
    try {
      const payload = collection.toPayload(sent)
      // Aborted if the form unmounts first: a late answer must not navigate away from wherever the user went.
      const saved =
        item === null
          ? await createItem(collection, payload, controller.signal)
          : await updateItem(collection, item.slug, payload, item.updatedAt, controller.signal)
      const title = collection.title(saved, t)
      const newer = latestDraft.current
      if (!sameDraft(newer, sent) && !sameDraft(newer, collection.toDraft(saved))) {
        keepNewerChanges(saved, newer, title)
        return
      }
      const list = adminPaths.collection(collection.id)
      clearDraft(draftId)
      announce(t(item === null ? 'editor.created' : 'editor.saved', { title }), 'success', { at: list })
      void navigate(list)
    } catch (error) {
      setSaving(false)
      if (isAbortError(error)) return
      // Back to the login page; the draft stays in the tab and comes back with this form.
      if (isUnauthorized(error)) {
        expire()
        return
      }
      if (error instanceof ApiHttpError && error.status === 422 && error.fields) {
        // Localized messages only: the server's own texts are English, for developers.
        const { errors: mapped, unmatched } = mapServerFields(error.fields, errorSlots(collection, sent, mode))
        failed(
          mapped,
          unmatched.map((path) => (path === 'body' ? { text: t('editor.bodyRejected') } : { text: t('editor.fieldRejected'), field: path })),
        )
      } else if (error instanceof ApiHttpError && error.status === 409 && mode === 'create') {
        failed({ slug: { key: 'slugTaken' } }, [])
      } else if (isChangedElsewhere(error)) {
        // Nothing was saved; the changes stay here (and in the tab) until the user loads the latest version.
        setConflict(true)
        failed({}, [{ text: t('editor.changedElsewhere') }])
      } else if (error instanceof ApiHttpError && error.status === 404) {
        failed({}, [{ text: t('editor.gone') }])
      } else if (error instanceof ApiHttpError && error.status === 413) {
        failed({}, [{ text: t('editor.tooLarge') }])
      } else if (error instanceof ApiHttpError) {
        failed({}, [{ text: t('editor.saveFailed') }])
      } else {
        failed({}, [{ text: t('editor.saveFailedNetwork') }])
      }
    } finally {
      if (request.current === controller) request.current = null
    }
  }

  // After a conflict: the row as the server has it now replaces the form, once the user has agreed to drop the changes.
  const latest = useConfirmedAction({
    run: async (_: null, signal) => {
      const rows = await listItems(collection, signal)
      return rows.find((row) => row.slug === item?.slug) ?? null
    },
    onDone: (_, row) => {
      setConflict(false)
      if (row === null) {
        // Deleted elsewhere meanwhile: there is no version to load; the changes stay on screen.
        setFormErrors([{ text: t('editor.gone') }])
        setFocusRequest((current) => current + 1)
        return
      }
      onRowChange(row)
      setDraft(collection.toDraft(row))
      setSlugEdited(false)
      setErrors({})
      setFormErrors([])
      setRestored(null)
      clearDraft(draftId)
      announce(t('editor.latestLoaded'))
    },
    failed: t('editor.loadLatestFailed'),
  })

  // A project's image changed (an upload or a removal): see `onImageChange`.
  const onProjectChange = (changed: ProjectItem) => {
    onImageChange(changed.image)
    // Without an image, a placeholder no longer conflicts with one: that message is out of date.
    if (changed.image === null) setErrors((current) => clearErrors(current, ['placeholder']))
  }

  const formErrorsId = `${formId}-form-errors`

  return (
    <>
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        aria-busy={saving || undefined}
        aria-describedby={formErrors.length > 0 ? formErrorsId : undefined}
        className="mt-8 flex max-w-4xl flex-col gap-8"
      >
        {restored ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-5 py-3 text-sm">
            <p className={restored.stale ? 'text-error' : undefined}>
              {t(restored.stale ? 'editor.restoredStale' : 'editor.restored')}
            </p>
            <button type="button" onClick={discardRestored} className={`inline-flex min-h-11 cursor-pointer items-center ${TEXT_LINK}`}>
              {t('editor.discardRestored')}
            </button>
          </div>
        ) : null}

        {formErrors.length > 0 ? (
          <div ref={formErrorRef} id={formErrorsId} tabIndex={-1} className="border border-line p-6 text-error">
            <p className="font-medium">{t('editor.formErrorsTitle')}</p>
            <ul role="list" className="mt-2 flex flex-col gap-2 text-sm">
              {formErrors.map((error, index) => (
                <li key={index} className="wrap-anywhere">
                  {error.text}
                  {error.field ? (
                    <>
                      {' '}
                      <code>{error.field}</code>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
            {conflict ? (
              <button type="button" onClick={() => latest.open(null)} className={`mt-4 ${SECONDARY_BUTTON}`}>
                {t('editor.loadLatest')}
              </button>
            ) : null}
          </div>
        ) : null}

        {collection.fields.map((field, index) => (
          <EditorField key={index} field={field} api={api} />
        ))}

        <div className="flex flex-wrap gap-3 border-t border-line pt-6">
          <button type="submit" aria-disabled={saving || undefined} className={PRIMARY_BUTTON}>
            {saving ? t('editor.saving') : item === null ? t('editor.create') : t('editor.save')}
          </button>
          <AdminLink to={adminPaths.collection(collection.id)} className={SECONDARY_BUTTON}>
            {t('editor.cancel')}
          </AdminLink>
        </div>
      </form>

      {/* The cover image lives beside the form, driven by the saved project (not by the unsaved checkbox),
          and is always there for a project: removing an image never takes its own dialog away. */}
      {collection.id === 'projects' ? (
        <div className="max-w-4xl">
          <ProjectImageSection
            slug={item?.slug ?? null}
            image={image}
            placeholder={project?.placeholder === true}
            onProjectChange={onProjectChange}
          />
        </div>
      ) : null}

      <ConfirmDialog
        {...latest.dialog}
        title={t('editor.loadLatestTitle')}
        confirmLabel={t('editor.loadLatestConfirm')}
        busyLabel={t('common.loading')}
        // The button that opened it goes away with the conflict: the message box, or else the heading.
        fallbackFocus={() => formErrorRef.current ?? pageHeading()}
      >
        {t('editor.loadLatestBody')}
      </ConfirmDialog>
    </>
  )
}
