import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveLanguage, slugFromLanguage } from '../../i18n/languages'
import { COLLECTION_IDS } from '../collections'
import { AdminNavLink } from '../components/AdminNavLink'
import { Icon } from '../components/Icon'
import { ADMIN_NS } from '../i18n'
import { adminPaths } from '../paths'
import { EYEBROW, NAV_ITEM, NAV_ITEM_IDLE } from '../styles'

interface AdminNavProps {
  email: string
  unread: number | null
  signingOut: boolean
  onLogout(): void
}

/** The panel's navigation: dashboard, the content collections, messages (with the unread count), CV, then the account. */
export function AdminNav({ email, unread, signingOut, onLogout }: AdminNavProps) {
  const { t, i18n } = useTranslation(ADMIN_NS)
  const contentLabel = useId()
  const siteHref = `/${slugFromLanguage(resolveLanguage(i18n.language))}`

  return (
    <>
      <ul role="list" className="flex flex-col gap-1">
        <li>
          <AdminNavLink to={adminPaths.dashboard} end>
            {t('nav.dashboard')}
          </AdminNavLink>
        </li>
        <li className="pt-2">
          <p id={contentLabel} className={`px-3 py-1.5 ${EYEBROW}`}>
            {t('nav.content')}
          </p>
          <ul role="list" aria-labelledby={contentLabel} className="flex flex-col gap-1">
            {COLLECTION_IDS.map((id) => (
              <li key={id}>
                <AdminNavLink to={adminPaths.collection(id)}>{t(`collections.${id}`)}</AdminNavLink>
              </li>
            ))}
          </ul>
        </li>
        <li className="pt-2">
          <AdminNavLink to={adminPaths.messages()}>
            <span>{t('nav.messages')}</span>{' '}
            {unread ? (
              <span className="rounded-full bg-accent px-2 py-1 font-mono text-xs text-accent-fg">
                <span aria-hidden="true">{unread}</span>
                <span className="sr-only">{t('nav.unread', { count: unread })}</span>
              </span>
            ) : null}
          </AdminNavLink>
        </li>
        <li>
          <AdminNavLink to={adminPaths.cv}>{t('nav.cv')}</AdminNavLink>
        </li>
      </ul>

      <div className="mt-6 flex flex-col gap-1 border-t border-line pt-6">
        <p className="px-3 py-1.5 text-xs text-muted wrap-anywhere">{t('nav.signedInAs', { email })}</p>
        <a href={siteHref} target="_blank" rel="noopener" className={`${NAV_ITEM} ${NAV_ITEM_IDLE}`}>
          <span>
            {t('nav.viewSite')}{' '}
            <span className="sr-only">{t('nav.newTab')}</span>
          </span>
          <Icon name="external" />
        </a>
        <button
          type="button"
          onClick={() => {
            if (!signingOut) onLogout()
          }}
          aria-disabled={signingOut || undefined}
          className={`${NAV_ITEM} ${NAV_ITEM_IDLE} w-full cursor-pointer aria-disabled:cursor-not-allowed aria-disabled:opacity-60`}
        >
          {signingOut ? t('nav.signingOut') : t('nav.signOut')}
        </button>
      </div>
    </>
  )
}
