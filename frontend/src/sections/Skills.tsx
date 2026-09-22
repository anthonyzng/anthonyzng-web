import { RevealItem } from '../components/RevealItem'
import { SectionShell } from '../components/SectionShell'
import { Skeleton } from '../components/Skeleton'

/** Pill widths in rem per placeholder group (fixed values, passed inline). */
const GROUPS = [
  [7, 5, 9, 6, 8],
  [6, 8, 5, 7],
  [9, 6, 7, 5, 8, 6],
] as const

/** Placeholder pill groups; the real skills list arrives in Phase 3. */
export function Skills() {
  return (
    <SectionShell id="skills">
      <div aria-hidden="true" className="flex flex-col gap-12">
        {GROUPS.map((pills, group) => (
          <RevealItem key={group}>
            <Skeleton variant="bar" width="6rem" />
            <div className="mt-5 flex flex-wrap gap-3">
              {pills.map((width, pill) => (
                <Skeleton key={pill} variant="pill" width={`${width}rem`} />
              ))}
            </div>
          </RevealItem>
        ))}
      </div>
    </SectionShell>
  )
}
