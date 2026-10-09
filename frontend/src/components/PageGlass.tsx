import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { usePageGlass } from '../animations/usePageGlass'
import { useMotionAllowed } from '../animations/useMotionAllowed'

/**
 * The page's one pane of frosted glass (`.page-glass` in index.css), behind the text of the content
 * sections and above the backdrop. A portal into <body>, fixed, so no section's fading opacity ever
 * becomes its backdrop root (which would cut its blur off from the stars or the bamboo). Decorative.
 * Placed and shown by `usePageGlass`.
 */
export function PageGlass({ sectionsKey }: { sectionsKey: string }) {
  const glass = useRef<HTMLDivElement>(null)
  const motion = useMotionAllowed()
  usePageGlass(glass, motion, sectionsKey)
  return createPortal(<div ref={glass} aria-hidden="true" className="page-glass" />, document.body)
}
