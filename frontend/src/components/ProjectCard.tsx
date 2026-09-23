import { useTranslation } from 'react-i18next'
import type { ResolvedProject } from '../content/resolved'
import { TagList } from './TagList'

interface ProjectCardProps {
  project: ResolvedProject
  /** One-based position, used to number the reserved slots ("Project 1", "Project 2"). */
  index: number
}

/**
 * One project card: image frame, title, summary, tech tags and an optional link.
 * A `placeholder` project is a reserved slot: it says so on a badge and describes nothing, so a
 * visitor can never mistake it for real work. The hatch plane keeps the frame's parallax alive and
 * is where a real screenshot will drop in.
 */
export function ProjectCard({ project, index }: ProjectCardProps) {
  const { t } = useTranslation()
  // A real project always carries its own copy; a null title or summary is treated as a slot anyway.
  const title = project.placeholder || project.title === null ? t('content.projects.placeholder.title', { index }) : project.title
  const summary =
    project.placeholder || project.summary === null ? t('content.projects.placeholder.summary') : project.summary

  return (
    <article className="flex h-full flex-col border border-line bg-surface">
      <div aria-hidden="true" className="relative aspect-[4/3] overflow-hidden border-b border-line">
        <div data-plane className="absolute inset-0 bg-hatch" />
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-title font-medium text-balance">{title}</h3>
          {project.placeholder ? (
            <span className="mt-1 shrink-0 rounded-full border border-line px-3 py-1 font-mono text-xs uppercase tracking-label text-muted">
              {t('content.projects.placeholder.badge')}
            </span>
          ) : null}
        </div>
        <p className="text-muted">{summary}</p>
        {/* Named after the project, so several cards never expose lists with one shared name. */}
        <TagList items={project.tech} label={t('content.techOf', { name: title })} className="mt-auto pt-2" />
        {project.url ? (
          <a
            href={project.url}
            className="mt-2 inline-flex min-h-11 items-center gap-2 self-start font-mono text-sm text-accent underline decoration-muted underline-offset-8 transition-colors hover:decoration-accent"
          >
            {t('content.projects.visit')}
            <span aria-hidden="true">-&gt;</span>
            {/* The space is part of the accessible name: without it several cards would read
                "View projectDemo project". */}
            {' '}
            <span className="sr-only">{title}</span>
          </a>
        ) : null}
      </div>
    </article>
  )
}
