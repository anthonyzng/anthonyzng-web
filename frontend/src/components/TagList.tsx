import { useTranslation } from 'react-i18next'
import { isTerm, type Tag } from '../content/tags'

interface TagListProps {
  items: readonly Tag[]
  /** Accessible name for the list, when no visible heading labels it. Must say whose list it is. */
  label?: string
  /** Id of the visible heading that labels the list; takes precedence over `label`. */
  labelledBy?: string
  /** 'sm' for dense tech tags under a timeline entry, 'md' for the Skills chips. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Chips for technology and skill names. Proper nouns (`'React'`) render verbatim in both locales;
 * descriptive terms (`term('dataPipelines')`) come from `content.terms.<id>`, so a Chinese reader
 * never meets an untranslated English phrase (see content/tags.ts).
 *
 * Static markup only, so it never carries a GSAP target and may use layout classes freely.
 * `role="list"` is explicit: Tailwind's preflight removes the markers, and WebKit then drops list
 * semantics, so VoiceOver would otherwise announce loose text instead of "list, N items".
 */
export function TagList({ items, label, labelledBy, size = 'sm', className }: TagListProps) {
  const { t } = useTranslation()
  if (items.length === 0) return null
  const chip = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-3 py-1 text-xs'

  return (
    <ul
      role="list"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={`flex flex-wrap gap-2${className ? ` ${className}` : ''}`}
    >
      {items.map((tag) => (
        <li
          key={isTerm(tag) ? `term:${tag.term}` : tag}
          className={`rounded-full border border-line font-mono text-muted ${chip}`}
        >
          {isTerm(tag) ? t(`content.terms.${tag.term}`) : tag}
        </li>
      ))}
    </ul>
  )
}
