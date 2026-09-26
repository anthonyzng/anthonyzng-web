import { useActiveSection } from '../animations/useActiveSection'
import { useHashScroll } from '../animations/useHashScroll'
import { SectionDock } from '../components/SectionDock'
import { ContentProvider } from '../content/ContentProvider'
import { Closing } from '../sections/Closing'
import { Experience } from '../sections/Experience'
import { Hero } from '../sections/Hero'
import { Projects } from '../sections/Projects'
import { LANDING_IDS } from '../sections/sectionIds'
import { Skills } from '../sections/Skills'
import { Statement } from '../sections/Statement'

export function HomePage() {
  useActiveSection(LANDING_IDS)
  // A parent effect: it runs after every section hook has created its triggers.
  useHashScroll()

  return (
    // One content snapshot for the four sections: static at once, the API's once it answers.
    <ContentProvider>
      <Hero />
      <Statement />
      <Experience />
      <Projects />
      <Skills />
      <Closing />
      <SectionDock />
    </ContentProvider>
  )
}
