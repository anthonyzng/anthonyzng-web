import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface ExternalLinkProps {
  href: string
  className?: string
  children: ReactNode
}

/** A link to another site, opened in a new tab; its accessible name says so. */
export function ExternalLink({ href, className, children }: ExternalLinkProps) {
  const { t } = useTranslation()
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children} <span className="sr-only">{t('common.newTab')}</span>
    </a>
  )
}
