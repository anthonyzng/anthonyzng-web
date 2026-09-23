import { describe, expect, it } from 'vitest'
import { MQ } from './animations/gsap'
import { BELOW_MD, MD_UP } from './animations/media'
import css from './index.css?raw'

/** Every non-test source file, as text. */
const sources = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('JS media queries', () => {
  it('switch layouts at the Tailwind md breakpoint, never at a px width', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10)
    for (const [file, source] of Object.entries(sources)) {
      // A px width breakpoint drifts from md: (48rem) whenever the default font size is not 16px.
      expect(source, file).not.toMatch(/width\s*(?::|[<>]=?)\s*[\d.]+px/)
    }
    expect(MQ.desktop).toContain(MD_UP)
    expect(MQ.pinnable).toContain(MD_UP)
    expect(MQ.mobile).toContain(BELOW_MD)
  })
})

describe('index.css', () => {
  it('shows a scrubbed reveal in full while something inside it has focus', () => {
    // Otherwise a keyboard user can tab into a form or link that is still translucent and displaced.
    const rule = /\[data-reveal-inner\]:focus-within\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(rule).toContain('opacity: 1 !important')
    expect(rule).toContain('transform: none !important')
  })

  it('makes every transition and animation instant under reduced motion, delays included', () => {
    const rule = /@media \(prefers-reduced-motion: reduce\) \{\s*\*,[^}]*\}/.exec(css)?.[0] ?? ''
    for (const declaration of [
      'animation-duration: 0.01ms !important',
      'animation-delay: 0s !important',
      'transition-duration: 0.01ms !important',
      // Without it, a staggered @starting-style entrance holds its hidden state for the whole delay.
      'transition-delay: 0s !important',
    ]) {
      expect(rule).toContain(declaration)
    }
  })
})
