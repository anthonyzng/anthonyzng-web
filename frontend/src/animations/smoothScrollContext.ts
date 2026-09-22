import type Lenis from 'lenis'
import { createContext } from 'react'
import type { LandingId } from '../sections/sectionIds'

export interface SmoothScrollApi {
  /** The single Lenis instance, or null (reduced motion, construction failure, or not yet created). */
  lenis: Lenis | null
  setActiveSection: (id: LandingId | null) => void
}

export const SmoothScrollContext = createContext<SmoothScrollApi>({ lenis: null, setActiveSection: () => {} })

/** The region being read. Kept separate so its changes re-render only its readers, not the whole page. */
export const ActiveSectionContext = createContext<LandingId | null>(null)
