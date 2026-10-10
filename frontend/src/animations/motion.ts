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
export const SPEED = {
  heroName1: 0.85,
  heroName2: 0.7,
  heroRule: 0.62,
  heroDeck: 0.55,
  ghost: 0.8,
  /** The photo behind "In brief": a slow drift (its box overscans 12% top and bottom for it). */
  statementPhoto: 0.9,
} as const

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
 * The page backdrop (`PageBackdrop`): stars in the dark sky (desktop, phone budget); the angle, in
 * degrees below the horizontal (negative climbs), of the shooting star each arriving section sends
 * across, in page order after the hero; the bamboo sway's length (s); how often a leaf drifts down
 * from the grove (s, a random wait between the two).
 */
export const BACKDROP = {
  stars: 140,
  starsPhone: 60,
  shootAngles: [-21, 13, -7, 26, -31, 4, -14],
  sway: 3.2,
  leafEvery: [5, 10],
} as const

/**
 * Hero scenes. Dark (`useBlackHole`): the most meteors at once, how long one may live (s), and how
 * far the shader's resolution may drop when frames run long (never below `minScale`, so a phone
 * capped at 30 fps stays sharp). Light (`useInkStream`): the most leaves at once, water strokes
 * (desktop, phone budget). Phones without a hover pointer get an idle meteor or leaf every `idle` s.
 */
export const HERO_SCENE = { meteors: 9, meteorLife: 6, minScale: 0.7, leaves: 6, flows: 46, flowsPhone: 22, idle: 3.4 } as const

/**
 * Contact screen. Dark: drifting meteor speed (px/s, desktop and phone), the spacing kept between
 * them (px), how often one swings in beside the title (s) and how long it rests there. Light: the
 * ink drop's phases (s), how long the written word stays and the pause before the next drop (a cycle
 * one second shorter than at first, at the owner's request).
 */
export const CONTACT_SCENE = {
  drift: 32,
  driftPhone: 25,
  spacing: 110,
  spacingPhone: 72,
  every: 8,
  rest: 2.6,
  splash: 0.5,
  write: 0.9,
  hold: 2.5,
  fade: 0.9,
  gap: 0.4,
} as const

/**
 * Canvas budgets (`canvasScale`, resolution.ts): the most device pixels each kind of canvas may hold,
 * and the density it never drops below. The black hole's shader runs on every pixel every frame, so it
 * gets the least; the backdrop (stars, bamboo) and the hero's ink are soft and scale up well; the
 * contact screens keep at least one device pixel per CSS pixel, since the ink writes words.
 * About 2 MP each, just over a 1080p screen at density 1 (untouched); a 4K one no longer fills 8 MP per canvas.
 */
export const CANVAS_BUDGET = {
  shader: { pixels: 2_100_000, floor: 0.5 },
  backdrop: { pixels: 2_100_000, floor: 0.75 },
  scene: { pixels: 2_400_000, floor: 0.75 },
  contact: { pixels: 3_000_000, floor: 1 },
} as const

/** The night sky redraws at most this often (fps) while no shooting star crosses it: the stars drift slowly. */
export const SKY_IDLE_FPS = 30

/** Section fade: the share of the viewport over which a section fades in (entering) and out (leaving). */
export const SECTION_FADE = { band: 0.6 } as const

/** Statement pin length, as a multiple of window.innerHeight. */
export const PIN_LENGTH = 1

/** A 5% band just above the viewport centre decides the active section. */
export const ACTIVE_ROOT_MARGIN = '-45% 0px -50% 0px'
