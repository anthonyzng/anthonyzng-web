import { useTranslation } from 'react-i18next'
import { ADMIN_NS } from '../i18n'

/** A quiet placeholder while a page's data loads; the page heading is already on screen. */
export function LoadingState({ className = '' }: { className?: string }) {
  const { t } = useTranslation(ADMIN_NS)
  return <p className={`text-muted ${className}`}>{t('common.loading')}</p>
}
