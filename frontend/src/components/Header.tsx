import { useRef, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useMatch } from 'react-router'
import { isPlainLeftClick, useScrollTo } from '../animations/useScrollTo'
import { useLocalizedPath } from '../i18n/useLocalizedPath'
import { SECTION_IDS } from '../sections/sectionIds'
import { LanguageSwitcher } from './LanguageSwitcher'
import { MobileMenu } from './MobileMenu'
import { ScrollProgress } from './ScrollProgress'
import { SectionLink } from './SectionLink'
import { ThemeToggle } from './ThemeToggle'

// min-h-11: a 44px hit area (these links also show on touch tablets). Forced colours paint the accent
// underline in Canvas and every link in LinkText, so there the current link is underlined instead.
const NAV_LINK =
  'relative inline-flex min-h-11 items-center text-muted transition-colors duration-200 hover:text-fg aria-[current=true]:text-fg ' +
  'underline-offset-8 forced-colors:aria-[current=true]:underline ' +
  'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-1 after:h-px after:origin-left after:scale-x-0 ' +
  'after:bg-accent after:transition-transform after:duration-300 after:ease-out-expo aria-[current=true]:after:scale-x-100'

export function Header() {
  const { t } = useTranslation()
  const localized = useLocalizedPath()
  const onHome = useMatch('/:lang') !== null
  const { scrollToTop } = useScrollTo()
  const desktopNav = useRef<HTMLElement>(null)

  const onLogoClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onHome || !isPlainLeftClick(event)) return
    event.preventDefault()
    scrollToTop()
  }

  return (
    // Solid below md: re-blurring moving type every frame is expensive on phones.
    <header
      data-site-header
      className="sticky top-0 z-50 h-(--header-h) border-b border-line/60 bg-bg/95 md:bg-bg/80 md:backdrop-blur-md"
    >
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          to={localized('/')}
          onClick={onLogoClick}
          className="inline-flex min-h-11 items-center font-mono text-sm font-medium tracking-tight text-fg"
        >
          anthonyzng<span className="text-accent">.</span>
        </Link>

        <nav ref={desktopNav} aria-label={t('nav.primary')} className="hidden md:block">
          <ul className="flex items-center gap-8 text-sm">
            {SECTION_IDS.map((id) => (
              <li key={id}>
                <SectionLink id={id} className={NAV_LINK}>
                  {t(`nav.${id}`)}
                </SectionLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
          <MobileMenu desktopNav={desktopNav} />
        </div>
      </div>
      <ScrollProgress />
    </header>
  )
}
