import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { BELOW_MD, MD_UP, MOTION_QUERY } from './media'

// The only place plugins are registered. Every hook imports gsap from this module,
// so registration always runs first.
gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)
// Showing or hiding the mobile URL bar never triggers a refresh.
ScrollTrigger.config({ ignoreMobileResize: true })

export { gsap, ScrollTrigger, SplitText, useGSAP }

/**
 * gsap.matchMedia conditions. Motion branches REQUIRE the positive no-preference match, so reduced
 * motion, browsers without the media feature and jsdom all get the static page.
 * `pinnable` also requires a fine, hovering primary pointer: there the wheel is smoothed by Lenis on the
 * main thread, so the pin switches in the same frame as the scroll. Touch tablets scroll natively on the
 * compositor (syncTouch is off), which makes a pin hitch, so they get the unpinned line reveal instead.
 */
export const MQ = {
  desktop: `${MD_UP} and ${MOTION_QUERY}`,
  mobile: `${BELOW_MD} and ${MOTION_QUERY}`,
  pinnable: `${MD_UP} and (min-height: 600px) and (hover: hover) and (pointer: fine) and ${MOTION_QUERY}`,
} as const

/**
 * Runs `setup` in its own context. If it throws, everything it created is reverted, so no content is
 * left hidden at a from-state. The try/catch sits inside the context callback on purpose: gsap only
 * restores its "current context" pointer when the callback returns normally.
 */
export function runSafely(setup: () => void, scope?: Element): gsap.Context {
  let failed = false
  let failure: unknown
  const ctx = gsap.context(() => {
    try {
      setup()
    } catch (error) {
      failed = true
      failure = error
    }
  }, scope)
  if (failed) {
    ctx.revert()
    if (import.meta.env.DEV) console.warn('[animations] setup failed; static state kept', failure)
  }
  return ctx
}

/** Live header height. The single source is --header-h; this reads the rendered value. */
export function headerOffset(): number {
  return document.querySelector<HTMLElement>('[data-site-header]')?.getBoundingClientRect().height ?? 64
}
