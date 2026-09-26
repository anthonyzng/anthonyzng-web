import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { randomCat, type CatKind } from './cats'
import { EdgeCat } from './EdgeCat'
import { tagSearchUrl } from './tagSearch'

interface TagListProps {
  /** Resolved chip text (see content/resolved.ts): proper nouns verbatim, terms already in the locale. */
  items: readonly string[]
  /** Accessible name for the list, when no visible heading labels it. Must say whose list it is. */
  label?: string
  /** Id of the visible heading that labels the list; takes precedence over `label`. */
  labelledBy?: string
  /** 'sm' for dense tech tags under a timeline entry, 'md' for the Skills chips. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Chips for technology and skill names. The text arrives resolved for the active locale, from the
 * API or from the static snapshot, so this list never looks anything up.
 *
 * Each chip is a link to a web search for the term, opened in a new tab; while it is hovered or
 * focused a tiny cat of a random colour runs along its top edge (`EdgeCat`). Chips sit above a
 * card's stretched link (`relative z-10`), so inside a project card they stay their own links.
 * Static markup only, so it never carries a GSAP target and may use layout classes freely.
 * `role="list"` is explicit: Tailwind's preflight removes the markers, and WebKit then drops list
 * semantics, so VoiceOver would otherwise announce loose text instead of "list, N items".
 */
export function TagList({ items, label, labelledBy, size = 'sm', className }: TagListProps) {
  if (items.length === 0) return null

  return (
    <ul
      role="list"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={`relative z-10 flex flex-wrap gap-2${className ? ` ${className}` : ''}`}
    >
      {items.map((tag, index) => (
        <li key={`${index}:${tag}`}>
          <TagChip tag={tag} size={size} />
        </li>
      ))}
    </ul>
  )
}

function TagChip({ tag, size }: { tag: string; size: 'sm' | 'md' }) {
  const { t } = useTranslation()
  const [cat, setCat] = useState<CatKind>(randomCat)
  const chip = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-3 py-1 text-xs'
  // A new cat for every visit.
  const newCat = () => setCat(randomCat())

  return (
    <a
      href={tagSearchUrl(t('tags.searchQuery', { tag }))}
      target="_blank"
      rel="noopener noreferrer"
      onPointerEnter={newCat}
      onFocus={newCat}
      className={`cat-host relative inline-flex rounded-full border border-line font-mono text-muted transition-colors duration-200 hover:border-accent hover:text-fg ${chip}`}
    >
      {tag}{' '}
      <span className="sr-only">{t('tags.searchHint')}</span>
      <EdgeCat kind={cat} />
    </a>
  )
}
