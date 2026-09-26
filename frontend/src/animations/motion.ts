/** Motion tokens. Hooks read these and never hard-code numbers. */

/** Seconds. */
export const DURATION = { base: 0.6, slow: 0.9, intro: 1.1, draw: 1.2 } as const
export const INTRO_MOBILE_FACTOR = 0.8

export const EASE = { out: 'expo.out', reveal: 'power3.out', settle: 'power2.out', none: 'none' } as const

export const STAGGER = { name: 0.08, roles: 0.06, rules: 0.08, statementLines: 0.12 } as const

/**
 * Lenis already smooths the wheel, so parallax and progress use scrub: true (a numeric scrub on top
 * would lag twice). Never scrub above 1.
 */
export const SCRUB = { parallax: true, reveal: 0.5, pin: 0.6, mobile: true } as const

/**
 * data-speed: 1 is native, below 1 is slower than the page, above 1 is faster.
 * Displacement is (1 - speed) x range. Speeds never increase from top to bottom within a composition.
 */
export const SPEED = { heroName1: 0.85, heroName2: 0.7, heroRule: 0.62, heroDeck: 0.55, ghost: 0.8 } as const

/** xPercent drift of the two name lines; desktop only. */
export const DRIFT_X = { heroName1: -3, heroName2: 8 } as const

/** On mobile the deviation from native speed is halved. */
export const MOBILE_FACTOR = 0.5
export const mobileSpeed = (speed: number): number => 1 - (1 - speed) * MOBILE_FACTOR

export const DISTANCE = {
  /** yPercent; must exceed maskHeight / innerHeight or a sliver of cap tops shows. */
  mask: 120,
  /** Mega name: line-height 0.86 plus the 0.18em mask padding. */
  maskMega: 130,
  /** px, halved on mobile. */
  label: 12,
  tagline: 24,
  item: 40,
  /** Image planes: yPercent travel and the overscan scale that hides the plane's edges. */
  plane: 6,
  planeMobile: 3,
  planeScale: 1.15,
} as const

/** clamp() guarantees the last section can always reach progress 1. */
export const TRIGGER = {
  enterStart: 'clamp(top 85%)',
  enterEnd: 'clamp(top 35%)',
  itemStart: 'clamp(top 90%)',
  itemEnd: 'clamp(top 60%)',
  lineStart: 'clamp(top 85%)',
  lineEnd: 'clamp(bottom 60%)',
} as const

/**
 * Hero ink wash (`useInkWash`): the scroll progress over the hero's travel at which ink starts and at
 * which it covers the hero; how much darker its wet edge pools per theme; the canvas resolution
 * relative to device pixels; how often its slow drift is redrawn while the scroll rests (the ink is soft, so a reduced resolution costs nothing visible and
 * keeps the shader cheap on phones).
 */
export const INK = { start: 0.02, full: 0.7, poolLight: 0.55, poolDark: 0.6, scale: 0.6, scaleMobile: 0.5, driftFps: 30 } as const

/**
 * Closing loop (`useZipperLoop`): how far the rows travel over the section's scroll (in loop
 * lengths), their drift in px per second, the row gap and the margin (px) kept around the title
 * when a row parts, and the width of the parting bell in row pitches.
 */
export const ZIPPER = { scroll: 0.6, drift: 18, driftMobile: 12, baseGap: 24, margin: 32, spread: 0.55 } as const

/** Statement pin length, as a multiple of window.innerHeight. */
export const PIN_LENGTH = 1

/** A 5% band just above the viewport centre decides the active section. */
export const ACTIVE_ROOT_MARGIN = '-45% 0px -50% 0px'
