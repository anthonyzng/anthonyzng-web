import { useTranslation } from 'react-i18next'

/** sessionStorage flag of App.tsx's one automatic reload after a failed admin chunk load. */
export const ADMIN_RELOAD_FLAG = 'admin:reloaded'

/**
 * Shown when the admin panel's code cannot be loaded even after the automatic reload (offline, or a
 * deploy that is still in progress). Its strings live in the public bundle, since the admin's own
 * are in the chunk that failed. Reloading clears the flag, so the next failure may reload once again.
 */
export function AdminLoadError() {
  const { t } = useTranslation()

  const reload = () => {
    try {
      sessionStorage.removeItem(ADMIN_RELOAD_FLAG)
    } catch {
      // No storage: the reload still asks for the current build.
    }
    location.reload()
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-24 sm:px-8">
      <h1 className="text-headline font-semibold">{t('adminLoad.title')}</h1>
      <p className="mt-4 text-lg text-muted">{t('adminLoad.body')}</p>
      <button
        type="button"
        onClick={reload}
        className="mt-10 inline-flex min-h-11 w-fit items-center bg-accent px-5 font-medium text-accent-fg transition-opacity hover:opacity-90"
      >
        {t('adminLoad.retry')}
      </button>
    </main>
  )
}
