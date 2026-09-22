import { RevealItem } from '../components/RevealItem'
import { SectionShell } from '../components/SectionShell'
import { Skeleton } from '../components/Skeleton'

const CARDS = [0, 1, 2, 3] as const

/**
 * Placeholder 2x2 card grid. The even-column offset is a static stagger on the untransformed
 * trigger wrapper (never on a GSAP target); the hatch planes inside the cards get parallax.
 */
export function Projects() {
  return (
    <SectionShell id="projects">
      <div aria-hidden="true" className="grid gap-8 md:grid-cols-2 md:pb-24">
        {CARDS.map((card) => (
          <RevealItem key={card} className="md:even:translate-y-24">
            <Skeleton variant="card" />
          </RevealItem>
        ))}
      </div>
    </SectionShell>
  )
}
