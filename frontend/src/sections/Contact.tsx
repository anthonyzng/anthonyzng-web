import { RevealItem } from '../components/RevealItem'
import { SectionShell } from '../components/SectionShell'
import { Skeleton } from '../components/Skeleton'

const FIELDS = [0, 1, 2] as const

/**
 * The closing beat, with a display-size heading. Field and button outlines only: this is not a form;
 * the real contact form arrives in a later phase.
 */
export function Contact() {
  return (
    <SectionShell id="contact" headingSize="display">
      <div aria-hidden="true" className="grid max-w-2xl gap-8">
        {FIELDS.map((field) => (
          <RevealItem key={field}>
            <Skeleton variant="field" />
          </RevealItem>
        ))}
        <RevealItem>
          <Skeleton variant="button" />
        </RevealItem>
      </div>
    </SectionShell>
  )
}
