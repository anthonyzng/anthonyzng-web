import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ADMIN_NS } from '../i18n'

/** "<page> · Admin · anthonyzng" in the tab. The title the site had is restored when the admin unmounts. */
export function usePageTitle(page: string): void {
  const { t } = useTranslation(ADMIN_NS)
  useEffect(() => {
    document.title = t('meta.pageTitle', { page })
  }, [page, t])
}
