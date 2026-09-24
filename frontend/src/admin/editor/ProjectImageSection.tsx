import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { fileUrl } from '../../api/files'
import { deleteProjectImage, uploadProjectImage } from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { pageHeading } from '../dom'
import { IMAGE_MAX_BYTES } from '../format'
import { useConfirmedAction } from '../hooks/useConfirmedAction'
import { useFileUpload } from '../hooks/useFileUpload'
import { ADMIN_NS } from '../i18n'
import type { ImageRef, ProjectItem } from '../schemas'
import { useStatus } from '../shell/statusContext'
import { DANGER_BUTTON, ERROR_TEXT, FILE_INPUT, HINT, LABEL } from '../styles'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * An accepted image by type, or by name when the system reports no type or an odd one (a .webp
 * without a type, `image/pjpeg`): the server checks the content either way.
 */
const isImage = (file: File): boolean => IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)

interface ProjectImageSectionProps {
  /** The saved project's slug; null on the create form (an image needs a saved row). */
  slug: string | null
  /** The saved project's image. */
  image: ImageRef | null
  /**
   * The saved project is a placeholder slot, which the server gives no image: saving it as a real
   * project comes first. The form's unsaved checkbox does not count, only what is stored.
   */
  placeholder: boolean
  /** The project as the server has it after an upload or a removal (only its `image` is taken over). */
  onProjectChange(project: ProjectItem): void
}

/**
 * A project's cover image, stored separately from the form: an upload (JPEG, PNG or WebP up to
 * 8 MB, re-encoded by the server) or a removal takes effect at once. The section is always there
 * for a project, so a removal never takes its own dialog away mid-way.
 */
export function ProjectImageSection({ slug, image, placeholder, onProjectChange }: ProjectImageSectionProps) {
  const { t } = useTranslation(ADMIN_NS)
  const { announce } = useStatus()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)

  const upload = useFileUpload({
    check: (file) => (!isImage(file) ? t('image.errors.type') : file.size > IMAGE_MAX_BYTES ? t('image.errors.size') : null),
    upload: (file, signal) => uploadProjectImage(slug ?? '', file, signal),
    onUploaded: onProjectChange,
    messages: {
      uploading: t('image.uploading'),
      uploaded: t('image.uploaded'),
      failed: t('image.uploadFailed'),
      refusals: {
        file_missing: t('image.errors.missing'),
        file_empty: t('image.errors.empty'),
        file_too_large: t('image.errors.size'),
        file_type: t('image.errors.type'),
        image_unreadable: t('image.errors.unreadable'),
        image_too_many_pixels: t('image.errors.tooManyPixels'),
        image_placeholder: t('image.errors.placeholder'),
      },
      rejected: t('image.errors.rejected'),
      generic: t('image.errors.upload'),
      busy: t('image.busy'),
    },
  })

  const removal = useConfirmedAction({
    run: (_: null, signal) => deleteProjectImage(slug ?? '', signal),
    onDone: (_, project) => {
      if (project) onProjectChange(project)
      announce(t('image.removed'), 'success')
    },
    failed: t('image.errors.remove'),
  })

  const headingId = `${id}-heading`
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <section aria-labelledby={headingId} className="mt-10 border border-line p-6">
      <h2 id={headingId} className="text-lg font-semibold">
        {t('image.title')}
      </h2>
      <p id={hintId} className={`mt-1 ${HINT}`}>
        {t('image.intro')}
      </p>

      {slug === null ? (
        <p className="mt-4 text-sm text-fg">{t('image.saveFirst')}</p>
      ) : (
        <>
          {image ? (
            <img
              src={fileUrl(image.url)}
              alt=""
              width={image.width}
              height={image.height}
              className="mt-4 w-full max-w-xl border border-line"
            />
          ) : placeholder ? null : (
            <p className="mt-4 text-sm text-muted">{t('image.none')}</p>
          )}

          {placeholder ? (
            <p className="mt-4 text-sm text-fg">{t('image.placeholderNote')}</p>
          ) : (
            <div className="mt-5">
              <label htmlFor={`${id}-file`} className={LABEL}>
                {image ? t('image.replace') : t('image.upload')}
              </label>
              <input
                ref={input}
                id={`${id}-file`}
                type="file"
                accept={IMAGE_TYPES.join(',')}
                onChange={upload.onChange}
                aria-invalid={upload.error ? true : undefined}
                aria-describedby={upload.error ? `${hintId} ${errorId}` : hintId}
                className={FILE_INPUT}
              />
              {upload.error ? (
                <p id={errorId} className={`mt-1 ${ERROR_TEXT}`}>
                  {upload.error}
                </p>
              ) : null}
              {upload.uploading ? <p className="mt-2 text-sm text-muted">{t('image.uploading')}</p> : null}
            </div>
          )}

          {/* Offered whenever there is an image, even on a stored placeholder: removing it is how such a row is repaired. */}
          {image ? (
            <button type="button" onClick={() => removal.open(null)} className={`mt-5 ${DANGER_BUTTON}`}>
              {t('image.remove')}
            </button>
          ) : null}
        </>
      )}

      <ConfirmDialog
        {...removal.dialog}
        title={t('image.removeTitle')}
        confirmLabel={t('image.removeConfirm')}
        busyLabel={t('image.removing')}
        fallbackFocus={() => input.current ?? pageHeading()}
      >
        {t('image.removeBody')}
      </ConfirmDialog>
    </section>
  )
}
