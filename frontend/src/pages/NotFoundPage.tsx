import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useLocalizedPath } from '../i18n/useLocalizedPath'

export function NotFoundPage() {
  const { t } = useTranslation()
  const localized = useLocalizedPath()

  return (
    <section className="mx-auto flex min-h-[60dvh] max-w-6xl flex-col justify-center px-5 py-24 sm:px-8">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-4 text-headline font-semibold">{t('notFound.title')}</h1>
      <p className="mt-4 text-lg text-muted">{t('notFound.body')}</p>
      <Link to={localized('/')} className="mt-10 w-fit text-accent underline-offset-4 hover:underline">
        {t('notFound.back')}
      </Link>
    </section>
  )
}
