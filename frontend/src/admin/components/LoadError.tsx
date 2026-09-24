import { useTranslation } from 'react-i18next'
import { pageHeading } from '../dom'
import { ADMIN_NS } from '../i18n'
import { SECONDARY_BUTTON } from '../styles'

interface LoadErrorProps {
  onRetry(): void
  /**
   * Data is on screen, but refreshing it failed, so it may be out of date: the notice sits above
   * that data instead of replacing it.
   */
  stale?: boolean
  className?: string
}

/**
 * A load that failed (network, 5xx, unexpected payload), with a retry. The message is an alert: it
 * is announced each time it appears, so a retry that fails again is heard too. Retry moves focus to
 * the page heading first, because this box goes away while the page loads again and focus must not
 * fall to <body>; the success of a retry is announced by the page (useAdminQuery's `retry`).
 */
export function LoadError({ onRetry, stale = false, className = '' }: LoadErrorProps) {
  const { t } = useTranslation(ADMIN_NS)
  return (
    <div className={`border border-line p-6 ${className}`}>
      <p role="alert" className="text-error">
        {stale ? t('common.refreshFailed') : t('common.loadFailed')}
      </p>
      <button
        type="button"
        onClick={() => {
          pageHeading()?.focus()
          onRetry()
        }}
        className={`mt-4 ${SECONDARY_BUTTON}`}
      >
        {t('common.retry')}
      </button>
    </div>
  )
}
