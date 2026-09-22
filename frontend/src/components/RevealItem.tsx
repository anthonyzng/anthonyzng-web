import type { ReactNode } from 'react'

interface RevealItemProps {
  className?: string
  children: ReactNode
}

/**
 * Per-item scrubbed reveal (see useSectionReveal). The outer div is the untransformed trigger, so it
 * may carry static layout classes; only the inner div is animated by GSAP.
 */
export function RevealItem({ className, children }: RevealItemProps) {
  return (
    <div data-reveal-item className={className}>
      <div data-reveal-inner>{children}</div>
    </div>
  )
}
