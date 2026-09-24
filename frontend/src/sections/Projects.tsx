import { useTranslation } from 'react-i18next'
import { ProjectCard } from '../components/ProjectCard'
import { RevealItem } from '../components/RevealItem'
import { SectionShell } from '../components/SectionShell'
import { useResolvedContent } from '../content/contentContext'

/**
 * The card grid. While any card is still a reserved slot (or there is none yet), a note says the
 * write-ups are on their way; it goes once every card is real work. The even-column offset is a
 * static stagger on the untransformed trigger wrapper (never on a GSAP target); the image plane
 * inside a card gets parallax.
 */
export function Projects() {
  const { t } = useTranslation()
  const { projects } = useResolvedContent()
  const writingUp = projects.length === 0 || projects.some((project) => project.placeholder)

  return (
    <SectionShell id="projects" motionKey={projects.map((project) => project.id).join()}>
      {writingUp ? <p className="font-mono text-sm text-muted">{t('content.projects.note')}</p> : null}
      <div className={`grid gap-8 md:grid-cols-2 md:pb-24${writingUp ? ' mt-10' : ''}`}>
        {projects.map((project, index) => (
          <RevealItem key={project.id} className="md:even:translate-y-24">
            <ProjectCard project={project} index={index + 1} />
          </RevealItem>
        ))}
      </div>
    </SectionShell>
  )
}
