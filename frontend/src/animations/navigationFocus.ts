import { NavigationType, useLocation, useNavigationType } from 'react-router'

/**
 * Router state a link passes so the page it opens knows where keyboard and screen-reader focus
 * belongs: 'section' (a section link used from another page lands on that section's heading) or
 * 'language' (after a language switch, focus returns to the language switcher).
 */
export type NavigationFocus = 'section' | 'language'

export interface NavigationFocusState {
  focus: NavigationFocus
  /** A language switch also carries how far the reader was into the landing region (0 to 1). */
  progress?: number
}

export const focusState = (focus: NavigationFocus): NavigationFocusState => ({ focus })

function requestsFocus(state: unknown, focus: NavigationFocus): boolean {
  return typeof state === 'object' && state !== null && (state as Partial<NavigationFocusState>).focus === focus
}

/**
 * True only for the navigation that asked for this focus: the link click that pushed the location.
 * History keeps router state, so Back/Forward and a reload (both POP) would otherwise replay the request
 * and move focus without any link being used.
 */
export function useFocusRequest(focus: NavigationFocus): boolean {
  const { state } = useLocation()
  return useNavigationType() === NavigationType.Push && requestsFocus(state, focus)
}

/** The reading progress a language switch carried, for the push that carried it only (0 otherwise). */
export function useRequestedProgress(): number {
  const { state } = useLocation()
  const pushed = useNavigationType() === NavigationType.Push
  const progress = typeof state === 'object' && state !== null ? (state as Partial<NavigationFocusState>).progress : undefined
  return pushed && typeof progress === 'number' && progress > 0 && progress <= 1 ? progress : 0
}
