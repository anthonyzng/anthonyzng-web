import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { fileUrl } from '../../api/files'
import { formatFileSize } from '../../i18n/formatFileSize'
import { deleteCv, fetchCv, uploadCv } from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LoadError } from '../components/LoadError'
import { LoadingState } from '../components/LoadingState'
import { PageHeading } from '../components/PageHeading'
import { CV_MAX_BYTES, formatDateTime } from '../format'
import { useAdminQuery } from '../hooks/useAdminQuery'
import { useConfirmedAction } from '../hooks/useConfirmedAction'
import { useFileUpload } from '../hooks/useFileUpload'
import { usePageTitle } from '../hooks/usePageTitle'
import { ADMIN_NS } from '../i18n'
import { useStatus } from '../shell/statusContext'
import { useSummary } from '../shell/summaryContext'
import { CARD, DANGER_BUTTON, ERROR_TEXT, FILE_INPUT, HINT, LABEL, TEXT_LINK } from '../styles'

/** A PDF by type or by name (some systems report no type, or a generic one, for .pdf); the server checks the content. */
const isPdf = (file: File): boolean => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

/**
 * The downloadable CV: what is online (name, size, date, a download link), upload or replace
 * (a PDF up to 10 MB, checked here before it travels) and remove (after a confirmation).
 */
export function CvPage() {
  const { t, i18n } = useTranslation(ADMIN_NS)
  const { announce } = useStatus()
  const { refresh } = useSummary()
  const { state, retry, setData } = useAdminQuery('cv', fetchCv)
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  usePageTitle(t('cv.title'))

  // The dashboard shows whether a CV is online: after a change it asks again, even mid-request.
  const upload = useFileUpload({
    check: (file) => (!isPdf(file) ? t('cv.errors.type') : file.size > CV_MAX_BYTES ? t('cv.errors.size') : null),
    upload: uploadCv,
    onUploaded: (cv) => {
      setData(() => cv)
      refresh({ force: true })
    },
    messages: {
      uploading: t('cv.uploading'),
      uploaded: t('cv.uploaded'),
      failed: t('cv.uploadFailed'),
      refusals: {
        file_missing: t('cv.errors.missing'),
        file_empty: t('cv.errors.empty'),
        file_too_large: t('cv.errors.size'),
        // The name and type passed the check above, so the server found no PDF signature.
        file_type: t('cv.errors.pdfInvalid'),
      },
      rejected: t('cv.errors.rejected'),
      generic: t('cv.errors.upload'),
      busy: t('cv.busy'),
    },
  })

  const removal = useConfirmedAction({
    run: (_: null, signal) => deleteCv(signal),
    onDone: () => {
      setData(() => null)
      refresh({ force: true })
      announce(t('cv.removed'), 'success')
    },
    failed: t('cv.errors.remove'),
  })

  const cv = state.status === 'ready' ? state.data : null
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <>
      <PageHeading>{t('cv.title')}</PageHeading>
      <p className="mt-3 max-w-xl text-sm text-muted">{t('cv.intro')}</p>

      {state.status !== 'ready' ? (
        state.status === 'error' ? (
          <LoadError onRetry={retry} className="mt-8" />
        ) : (
          <LoadingState className="mt-8" />
        )
      ) : (
        <div className="mt-8 flex max-w-3xl flex-col gap-8">
          <section aria-labelledby={`${id}-current`} className={`${CARD} p-6`}>
            <h2 id={`${id}-current`} className="font-medium">
              {t('cv.current')}
            </h2>
            {cv ? (
              <>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-3 text-sm">
                  <dt className="text-muted">{t('cv.file')}</dt>
                  <dd className="wrap-anywhere">{cv.filename}</dd>
                  <dt className="text-muted">{t('cv.size')}</dt>
                  <dd>{formatFileSize(cv.size, i18n.language)}</dd>
                  <dt className="text-muted">{t('cv.updated')}</dt>
                  <dd>
                    <time dateTime={cv.updatedAt}>{formatDateTime(cv.updatedAt, i18n.language)}</time>
                  </dd>
                </dl>
                <div className="mt-5 flex flex-wrap items-center gap-4">
                  <a href={fileUrl(cv.url)} className={`inline-flex min-h-11 items-center ${TEXT_LINK}`}>
                    {t('cv.download')}{' '}
                    <span className="sr-only">{cv.filename}</span>
                  </a>
                  <button type="button" onClick={() => removal.open(null)} className={DANGER_BUTTON}>
                    {t('cv.remove')}
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">{t('cv.none')}</p>
            )}
          </section>

          <div>
            <label htmlFor={`${id}-file`} className={LABEL}>
              {cv ? t('cv.replace') : t('cv.upload')}
            </label>
            <p id={hintId} className={`mt-1 ${HINT}`}>
              {t('cv.hint')}
            </p>
            <input
              ref={input}
              id={`${id}-file`}
              type="file"
              accept="application/pdf,.pdf"
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
            {upload.uploading ? <p className="mt-2 text-sm text-muted">{t('cv.uploading')}</p> : null}
          </div>
        </div>
      )}

      <ConfirmDialog
        {...removal.dialog}
        title={t('cv.removeTitle')}
        confirmLabel={t('cv.removeConfirm')}
        busyLabel={t('cv.removing')}
        fallbackFocus={() => input.current}
      >
        {t('cv.removeBody')}
      </ConfirmDialog>
    </>
  )
}
