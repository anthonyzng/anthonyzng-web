import { useActiveSection } from '../animations/useActiveSection'
import { useHashScroll } from '../animations/useHashScroll'
import { useSectionFades } from '../animations/useSectionFades'
import { PageBackdrop } from '../components/PageBackdrop'
import { SectionDock } from '../components/SectionDock'
import { ContentProvider } from '../content/ContentProvider'
import { useResolvedContent } from '../content/contentContext'
import { Archive } from '../sections/Archive'
import { Closing } from '../sections/Closing'
import { Experience } from '../sections/Experience'
import { Hero } from '../sections/Hero'
import { Projects } from '../sections/Projects'
import { LANDING_IDS } from '../sections/sectionIds'
import { Skills } from '../sections/Skills'
import { Statement } from '../sections/Statement'
import { Tools } from '../sections/Tools'

export function HomePage() {
  useActiveSection(LANDING_IDS)
  // A parent effect: it runs after every section hook has created its triggers.
  useHashScroll()

  return (
    // One content snapshot for every section: static at once, the API's once it answers.
    <ContentProvider>
      <Hero />
      <Statement />
      <Experience />
      <Projects />
      <Skills />
      <Tools />
      <Closing />
      <Archive />
      <PageMotion />
      <SectionDock />
    </ContentProvider>
  )
}

/**
 * What spans the whole page, mounted after the sections so they exist when it starts: the backdrop
 * behind them all, and the fade of each section in and out as it scrolls past (rebuilt when the
 * archive comes or goes with the API's content).
 */
function PageMotion() {
  const { archive } = useResolvedContent()
  const sections = archive.length > 0 ? 'archive' : ''
  useSectionFades(sections)
  return <PageBackdrop sectionsKey={sections} />
}
