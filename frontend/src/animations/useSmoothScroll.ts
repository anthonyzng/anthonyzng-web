import type Lenis from 'lenis'
import { use } from 'react'
import type { LandingId } from '../sections/sectionIds'
import { ActiveSectionContext, SmoothScrollContext } from './smoothScrollContext'

export function useLenis(): Lenis | null {
  return use(SmoothScrollContext).lenis
}

export function useActiveSectionId(): LandingId | null {
  return use(ActiveSectionContext)
}

export function useSetActiveSection(): (id: LandingId | null) => void {
  return use(SmoothScrollContext).setActiveSection
}
