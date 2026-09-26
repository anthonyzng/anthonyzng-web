import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiHttpError, isAbortError } from '../../api/client'
import { disableTotp, enableTotp, fetchTotpStatus, isUnauthorized, startTotpSetup } from '../api'
import { LoadError } from '../components/LoadError'
import { LoadingState } from '../components/LoadingState'
import { PageHeading } from '../components/PageHeading'
import { QrCode } from '../components/QrCode'
import { formatDateTime } from '../format'
import { useAdminQuery } from '../hooks/useAdminQuery'
import { usePageTitle } from '../hooks/usePageTitle'
import { ADMIN_NS } from '../i18n'
import type { TotpSetup, TotpStatus } from '../schemas'
import { TotpConfirmForm } from '../security/TotpConfirmForm'
import { useSession } from '../session/sessionContext'
import { useStatus } from '../shell/statusContext'
import { useSummary } from '../shell/summaryContext'
import { CARD, ERROR_TEXT, HINT, PRIMARY_BUTTON, SECONDARY_BUTTON } from '../styles'

/** The base32 secret in groups of four, easier to copy into an app by hand. */
const grouped = (secret: string): string => secret.replace(/(.{4})(?=.)/g, '$1 ')

/**
 * Two-factor sign-in: whether it is on, and turning it on (scan a QR code or type the key, then
 * confirm with the password and a code from the app) or off (the password and a current code).
 * Either change signs every other device out; this tab keeps its (re-issued) session. After a
 * change the section heading takes focus and the result is announced.
 */
export function SecurityPage() {
  const { t, i18n } = useTranslation(ADMIN_NS)
  const { announce } = useStatus()
  const { refresh } = useSummary()
  const { expire } = useSession()
  const { state, retry, reload, setData } = useAdminQuery('totp', fetchTotpStatus)
  const id = useId()
  const sectionHeading = useRef<HTMLHeadingElement>(null)
  const setupRequest = useRef<AbortController | null>(null)
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [setupState, setSetupState] = useState<'idle' | 'starting' | 'failed'>('idle')
  const [headingFocus, setHeadingFocus] = useState(0)
  usePageTitle(t('security.title'))

  useEffect(() => () => setupRequest.current?.abort(), [])

  useEffect(() => {
    if (headingFocus > 0) sectionHeading.current?.focus()
  }, [headingFocus])

  const begin = async () => {
    if (setupState === 'starting') return
    setSetupState('starting')
    const controller = new AbortController()
    setupRequest.current = controller
    try {
      setSetup(await startTotpSetup(controller.signal))
      setSetupState('idle')
    } catch (caught) {
      if (isAbortError(caught)) return
      if (isUnauthorized(caught)) {
        expire()
        return
      }
      if (caught instanceof ApiHttpError && caught.status === 409) {
        setSetupState('idle')
        conflict()
        return
      }
      setSetupState('failed')
    } finally {
      if (setupRequest.current === controller) setupRequest.current = null
    }
  }

  const changed = (status: TotpStatus, message: string) => {
    setData(() => status)
    setSetup(null)
    refresh({ force: true })
    announce(message, 'success')
    setHeadingFocus((current) => current + 1)
  }

  const conflict = () => {
    setSetup(null)
    reload()
    announce(t('security.errors.conflict'), 'error')
    setHeadingFocus((current) => current + 1)
  }

  const status = state.data
  const headingId = `${id}-heading`

  return (
    <>
      <PageHeading>{t('security.title')}</PageHeading>

      {status === null ? (
        state.status === 'error' ? <LoadError onRetry={retry} className="mt-8" /> : <LoadingState className="mt-8" />
      ) : (
        <section aria-labelledby={headingId} className={`mt-8 max-w-3xl p-6 ${CARD}`}>
          <h2 id={headingId} ref={sectionHeading} tabIndex={-1} className="font-medium">
            {t('security.totpHeading')}
          </h2>
          <p className="mt-2 text-sm text-muted">{t('security.intro')}</p>
          <p className="mt-4 text-sm font-medium">
            {status.enabled && status.enabledAt ? (
              <>
                {t('security.onSince')}{' '}
                <time dateTime={status.enabledAt}>{formatDateTime(status.enabledAt, i18n.language)}</time>
              </>
            ) : (
              t('security.off')
            )}
          </p>

          {status.enabled ? (
            <div className="mt-6 border-t border-line pt-6">
              <h3 className="font-medium">{t('security.disableHeading')}</h3>
              <p className={`mt-1 mb-5 ${HINT}`}>{t('security.disableBody')}</p>
              <TotpConfirmForm
                action="disable"
                submit={disableTotp}
                onDone={(result) => changed(result, t('security.disabled'))}
                onConflict={conflict}
              />
            </div>
          ) : setup ? (
            <div className="mt-6 flex flex-col gap-6 border-t border-line pt-6">
              <div>
                <h3 className="font-medium">{t('security.scanStep')}</h3>
                <div className="mt-4 w-fit border border-line p-2">
                  <QrCode value={setup.uri} label={t('security.qrLabel')} />
                </div>
                <p className={`mt-4 ${HINT}`}>{t('security.manual')}</p>
                <p className="mt-2 w-fit bg-bg px-3 py-2 font-mono text-sm tracking-wide wrap-anywhere">
                  <code>{grouped(setup.secret)}</code>
                </p>
              </div>
              <div>
                <h3 className="font-medium">{t('security.confirmStep')}</h3>
                <div className="mt-4">
                  <TotpConfirmForm
                    action="enable"
                    submit={enableTotp}
                    onDone={(result) => changed(result, t('security.enabled'))}
                    onConflict={conflict}
                  />
                </div>
              </div>
              <button type="button" onClick={() => setSetup(null)} className={`${SECONDARY_BUTTON} w-fit`}>
                {t('security.cancel')}
              </button>
            </div>
          ) : (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => void begin()}
                aria-disabled={setupState === 'starting' || undefined}
                className={PRIMARY_BUTTON}
              >
                {setupState === 'starting' ? t('security.starting') : t('security.setUp')}
              </button>
              {setupState === 'failed' ? (
                <p role="alert" className={`mt-3 ${ERROR_TEXT}`}>
                  {t('security.errors.setupFailed')}
                </p>
              ) : null}
            </div>
          )}

          <p className={`mt-8 border-t border-line pt-4 ${HINT}`}>{t('security.lostDevice')}</p>
          <p className="mt-2 bg-bg px-3 py-2 font-mono text-xs wrap-anywhere">
            <code>docker compose run --rm backend python -m app.admin_totp reset</code>
          </p>
        </section>
      )}
    </>
  )
}
