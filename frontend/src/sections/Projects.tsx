import { useTranslation } from 'react-i18next'
import { ProjectCard } from '../components/ProjectCard'
import { RevealItem } from '../components/RevealItem'
import { SectionShell } from '../components/SectionShell'
import { useResolvedContent } from '../content/contentContext'

/**
 * The finished card grid, currently holding reserved slots: the write-ups are not ready, and the
 * note plus each card's badge say so. The even-column offset is a static stagger on the
 * untransformed trigger wrapper (never on a GSAP target); the hatch plane inside a card gets parallax.
 */
export function Projects() {
  const { t } = useTranslation()
  const { projects } = useResolvedContent()

  return (
    <SectionShell id="projects">
      <p className="font-mono text-sm text-muted">{t('content.projects.note')}</p>
      <div className="mt-10 grid gap-8 md:grid-cols-2 md:pb-24">
        {projects.map((project, index) => (
          <RevealItem key={project.id} className="md:even:translate-y-24">
            <ProjectCard project={project} index={index + 1} />
          </RevealItem>
        ))}
      </div>
    </SectionShell>
  )
}
