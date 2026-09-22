import { useActiveSection } from '../animations/useActiveSection'
import { useHashScroll } from '../animations/useHashScroll'
import { Contact } from '../sections/Contact'
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
    <>
      <Hero />
      <Statement />
      <Experience />
      <Projects />
      <Skills />
      <Contact />
    </>
  )
}
