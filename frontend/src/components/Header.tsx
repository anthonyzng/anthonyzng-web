import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'
import { useLocalizedPath } from '../i18n/useLocalizedPath'

const SECTIONS = ['experience', 'projects', 'skills', 'contact'] as const

export function Header() {
  const { t } = useTranslation()
  const localized = useLocalizedPath()

  return (
    <header className="sticky top-0 z-50 border-b border-line/60 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link to={localized('/')} className="font-mono text-sm font-medium tracking-tight text-fg">
          anthonyzng<span className="text-accent">.</span>
        </Link>

        <nav aria-label={t('nav.primary')} className="hidden md:block">
          <ul className="flex items-center gap-8 text-sm text-muted">
            {SECTIONS.map((section) => (
              <li key={section}>
                <a href={`#${section}`} className="transition-colors duration-200 hover:text-fg">
                  {t(`nav.${section}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
