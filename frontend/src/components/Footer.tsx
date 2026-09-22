import { useTranslation } from 'react-i18next'

export function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted sm:px-8">
        {t('footer.rights', { year: new Date().getFullYear() })}
      </div>
    </footer>
  )
}
