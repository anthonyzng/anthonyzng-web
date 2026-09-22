import { useTranslation } from 'react-i18next'

const ROLES = ['fullStack', 'ai', 'manager'] as const

/** Placeholder home page; the scroll-driven hero and sections arrive in Phase 2–3. */
export function HomePage() {
  const { t } = useTranslation()

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl flex-col justify-center px-5 py-24 sm:px-8">
      <p className="mb-6 font-mono text-sm uppercase tracking-[0.2em] text-accent">{t('home.eyebrow')}</p>
      <h1 className="text-display font-semibold">{t('home.name')}</h1>
      <ul className="mt-8 flex flex-col gap-2 text-lg text-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
        {ROLES.map((role) => (
          <li key={role} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-accent" />
            {t(`home.roles.${role}`)}
          </li>
        ))}
      </ul>
      <p className="mt-10 max-w-2xl text-lg leading-relaxed text-fg/90 sm:text-xl">{t('home.intro')}</p>
      <p className="mt-16 font-mono text-sm text-muted">{t('home.comingSoon')}</p>
    </section>
  )
}
