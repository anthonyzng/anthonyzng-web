import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { fileUrl } from '../api/files'
import type { ResolvedProject } from '../content/resolved'
import { TagList } from './TagList'

interface ProjectCardProps {
  project: ResolvedProject
  /** One-based position, used to number the reserved slots ("Project 1", "Project 2"). */
  index: number
}

/** The band around the middle of the viewport in which a card counts as the one being read. */
const READING_BAND = '-35% 0px -35% 0px'

/** True while `element` crosses the middle of the viewport (never without IntersectionObserver). */
function useInReadingBand(element: RefObject<HTMLElement | null>): boolean {
  const [inBand, setInBand] = useState(false)
  useEffect(() => {
    const node = element.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setInBand(entry?.isIntersecting ?? false), {
      rootMargin: READING_BAND,
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [element])
  return inBand
}

/**
 * One project card: image frame, title, summary and tech tags.
 * A `placeholder` project is a reserved slot: it says so on a badge and describes nothing, so a
 * visitor can never mistake it for real work.
 *
 * A real project with a link is clickable as a whole: the title is the link (its accessible name)
 * and stretches over the card (`after:inset-0`), opening the address set in the admin panel in a
 * new tab; the tags stay their own links above it. While any card (a reserved slot too) is
 * hovered, focused or crosses the middle of the screen, a comet of light runs round its border,
 * changing colour and flickering (`.card-light*` in index.css; decorative).
 *
 * The frame holds a plane that drifts inside it on scroll (`useParallax`): the hatch texture, with
 * the uploaded cover image over it when there is one, cropped to the frame. An image that cannot be
 * loaded (the API is down, or the saved snapshot names a file of another database) hides itself and
 * leaves the hatch, never an empty frame. The image is decorative (`alt=""`, the frame is hidden
 * from assistive technology): the title and summary next to it already say what the project is.
 */
export function ProjectCard({ project, index }: ProjectCardProps) {
  const { t } = useTranslation()
  const card = useRef<HTMLElement>(null)
  // A real project always carries its own copy; a null title or summary is treated as a slot anyway.
  const title = project.placeholder || project.title === null ? t('content.projects.placeholder.title', { index }) : project.title
  const summary =
    project.placeholder || project.summary === null ? t('content.projects.placeholder.summary') : project.summary
  const image = project.placeholder ? null : project.image
  const real = !project.placeholder
  const link = real ? project.url : null
  const inBand = useInReadingBand(card)

  return (
    <article
      ref={card}
      data-light-active={inBand || undefined}
      className={`light-host relative flex h-full flex-col border border-line bg-surface${
        link
          ? ' transition-colors duration-200 hover:border-accent has-[.card-link:focus-visible]:outline-2 has-[.card-link:focus-visible]:outline-offset-4 has-[.card-link:focus-visible]:outline-accent'
          : ''
      }`}
    >
      <div aria-hidden="true" className="relative aspect-[4/3] overflow-hidden border-b border-line">
        <div data-plane className="absolute inset-0 bg-hatch">
          {image ? (
            // Keyed by URL: a new image gets a fresh element, so a hidden broken one never hides it.
            <img
              key={image.url}
              src={fileUrl(image.url)}
              width={image.width}
              height={image.height}
              alt=""
              loading="lazy"
              decoding="async"
              onError={(event) => {
                event.currentTarget.hidden = true
              }}
              className="size-full bg-surface object-cover"
            />
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-title font-medium text-balance">
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="card-link outline-none after:absolute after:inset-0 after:content-['']"
              >
                {title}{' '}
                <span className="sr-only">{t('common.newTab')}</span>
              </a>
            ) : (
              title
            )}
          </h3>
          {project.placeholder ? (
            <span className="mt-1 shrink-0 rounded-full border border-line px-3 py-1 font-mono text-xs uppercase tracking-label text-muted">
              {t('content.projects.placeholder.badge')}
            </span>
          ) : null}
        </div>
        <p className="text-muted">{summary}</p>
        {/* Named after the project, so several cards never expose lists with one shared name. */}
        <TagList items={project.tech} label={t('content.techOf', { name: title })} className="mt-auto pt-2" />
        {link ? (
          // The whole card is the link; this is only its visible cue.
          <span
            aria-hidden="true"
            className="mt-2 inline-flex min-h-11 items-center gap-2 self-start font-mono text-sm text-accent underline decoration-muted underline-offset-8"
          >
            {t('content.projects.visit')}
            <span>-&gt;</span>
          </span>
        ) : null}
      </div>
      <span aria-hidden="true" className="card-light">
        <span className="card-light-glow">
          <span className="card-light-ring" />
        </span>
      </span>
    </article>
  )
}
