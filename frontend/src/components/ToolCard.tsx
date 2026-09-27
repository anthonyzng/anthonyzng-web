import { useTranslation } from 'react-i18next'
import type { ResolvedTool } from '../content/resolved'
import { formatIndex } from '../sections/sectionIds'
import { TagList } from './TagList'

interface ToolCardProps {
  tool: ResolvedTool
  /** Zero-based position in the list, shown as the card's number. */
  index: number
}

/**
 * One tool: what sort it is, its name, a line on what it does and its chips. The whole card opens
 * the tool (the name's link stretches over it, new tab); the chips stay their own links above it.
 * Hovering or focusing it lifts the border to the accent and nudges the arrow of the cue.
 */
export function ToolCard({ tool, index }: ToolCardProps) {
  const { t } = useTranslation()

  return (
    <article
      className={`group relative flex h-full flex-col border border-line bg-surface p-6 md:p-8${
        tool.url
          ? ' transition-colors duration-200 hover:border-accent has-[.card-link:focus-visible]:border-accent has-[.card-link:focus-visible]:outline-2 has-[.card-link:focus-visible]:outline-offset-4 has-[.card-link:focus-visible]:outline-accent'
          : ''
      }`}
    >
      <div className="flex items-baseline justify-between gap-4 font-mono text-xs uppercase tracking-label">
        <p className="text-accent">{tool.kind}</p>
        <span aria-hidden="true" className="tabular-nums text-muted">
          {formatIndex(index)}
        </span>
      </div>
      <h3 className="mt-8 text-title font-medium text-balance">
        {tool.url ? (
          <a
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="card-link outline-none after:absolute after:inset-0 after:content-['']"
          >
            {tool.name} <span className="sr-only">{t('common.newTab')}</span>
          </a>
        ) : (
          tool.name
        )}
      </h3>
      <p className="mt-3 text-muted text-pretty">{tool.summary}</p>
      <TagList items={tool.tech} label={t('content.techOf', { name: tool.name })} className="mt-auto pt-8" />
      {tool.url ? (
        // The whole card is the link; this is only its visible cue.
        <span aria-hidden="true" className="mt-6 inline-flex items-center gap-2 self-start font-mono text-sm text-accent">
          {t('content.tools.open')}
          <span className="transition-transform duration-300 ease-out-expo group-hover:translate-x-1 group-hover:-translate-y-1 motion-reduce:transition-none">
            ↗
          </span>
        </span>
      ) : null}
    </article>
  )
}
