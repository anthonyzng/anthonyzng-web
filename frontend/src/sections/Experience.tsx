import { RevealItem } from '../components/RevealItem'
import { SectionShell } from '../components/SectionShell'
import { Skeleton } from '../components/Skeleton'

const ROWS = [0, 1, 2] as const

/** Placeholder rows; the pinned Experience timeline arrives in Phase 3. */
export function Experience() {
  return (
    <SectionShell id="experience">
      <div aria-hidden="true">
        {ROWS.map((row) => (
          <RevealItem key={row} className="border-t border-line py-8">
            <div className="flex flex-col gap-3">
              <Skeleton variant="bar" width="6rem" />
              <Skeleton variant="bar" height="md" width="66%" />
              <Skeleton variant="bar" width="50%" />
            </div>
          </RevealItem>
        ))}
      </div>
    </SectionShell>
  )
}
