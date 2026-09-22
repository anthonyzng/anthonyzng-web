import { useRef } from 'react'
import { useScrollProgress } from '../animations/useScrollProgress'

/**
 * 1px accent rule on the header's bottom edge that tracks document scroll. Shown only on a positive
 * no-preference match (motion-safe), the same condition the hook's matchMedia branches require, so a
 * live preference change needs no re-render. The initial scaleX(0) comes only from GSAP: if it fails,
 * a harmless static accent border remains.
 */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null)
  useScrollProgress(ref)
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -bottom-px hidden h-px origin-left bg-accent motion-safe:block"
    />
  )
}
