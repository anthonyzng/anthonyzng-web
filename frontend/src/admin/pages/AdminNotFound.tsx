import { useTranslation } from 'react-i18next'
import { AdminLink } from '../components/AdminLink'
import { PageHeading } from '../components/PageHeading'
import { usePageTitle } from '../hooks/usePageTitle'
import { ADMIN_NS } from '../i18n'
import { adminPaths } from '../paths'
import { TEXT_LINK } from '../styles'

/** An admin URL that names no page, collection or row. */
export function AdminNotFound() {
  const { t } = useTranslation(ADMIN_NS)
  usePageTitle(t('notFound.title'))
  return (
    <>
      <PageHeading>{t('notFound.title')}</PageHeading>
      <p className="mt-3 text-muted">{t('notFound.body')}</p>
      <AdminLink to={adminPaths.dashboard} className={`mt-6 inline-flex min-h-11 items-center ${TEXT_LINK}`}>
        {t('notFound.back')}
      </AdminLink>
    </>
  )
}
