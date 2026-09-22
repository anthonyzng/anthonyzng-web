import { act, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import i18n from '../i18n'
import { navigation } from '../test/navigation'
import { NavigationHandle } from '../test/NavigationHandle'
import { FakeLenis } from '../test/fakeLenis'
import {
  fireMediaChange,
  mobileMotionMatcher,
  motionMatcher,
  setMatchMedia,
  shortDesktopMotionMatcher,
} from '../test/matchMedia'
import { MQ, ScrollTrigger, SplitText } from './gsap'

vi.mock('lenis', () => import('../test/fakeLenis'))

function renderApp(path: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <NavigationHandle />
      </MemoryRouter>
    </StrictMode>,
  )
}

// jsdom has no layout, so GSAP's CSSPlugin re-inserts each unrendered target it measures before its
// next element sibling; the h1's separating space text node then moves and its accessible name reads
// "AnthonyNg". Real browsers render the hero, so this only affects jsdom: query the h1 by level here.
const findHero = () => screen.findByRole('heading', { level: 1 })
const pinSpacers = () => document.querySelectorAll('.pin-spacer')
const liveLenis = () => FakeLenis.instances.filter((lenis) => lenis.destroy.mock.calls.length === 0)

/** Real GSAP in jsdom with StrictMode and several remounts is slow; give these tests room. */
const MOTION_TEST_TIMEOUT_MS = 30_000

const inSection = (trigger: ScrollTrigger) =>
  trigger.trigger instanceof Element && trigger.trigger.closest('#experience, #projects, #skills, #contact') !== null
/** gsap ignores media changes that arrive less than 2ms after the previous one. */
const nextMediaChange = () => new Promise((resolve) => setTimeout(resolve, 10))
const rect = (top: number, height: number) =>
  ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

async function renderHome() {
  const view = renderApp('/en')
  await findHero()
  await waitFor(() => expect(liveLenis()).toHaveLength(1))
  return { ...view, lenis: liveLenis()[0] }
}

/**
 * SplitText's default (aria: 'auto') would put an aria-label on the split copy and aria-hidden on its
 * lines. The copy is aria-hidden already and its sr-only twin carries the text, so no aria-label may
 * appear anywhere in the statement.
 */
function expectStatementSplitWithoutAriaLabel() {
  const statement = document.getElementById('statement')!
  const copy = statement.querySelector<HTMLElement>('[data-split]')!
  expect(copy.querySelectorAll('div').length).toBeGreaterThan(0)
  expect(copy).not.toHaveAttribute('aria-label')
  expect(statement.querySelectorAll('[aria-label]')).toHaveLength(0)
}

/** Motion smoke and leak test: real GSAP, ScrollTrigger and SplitText, a fake Lenis, StrictMode double effects. */
describe('motion setup and cleanup', () => {
  let warn: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    await i18n.changeLanguage('en')
    FakeLenis.reset()
    setMatchMedia(motionMatcher)
    warn = vi.spyOn(console, 'warn')
    error = vi.spyOn(console, 'error')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds the choreography on mount and leaves nothing behind on unmount', async () => {
    const { unmount } = renderApp('/en')
    await findHero()
    await waitFor(() => expect(liveLenis()).toHaveLength(1))

    // Motion really ran: triggers, exactly one pin (StrictMode's double effects left no duplicate) and the split.
    expect(ScrollTrigger.getAll().length).toBeGreaterThan(20)
    expect(pinSpacers()).toHaveLength(1)
    const copy = document.querySelector<HTMLElement>('[data-split]')!
    expectStatementSplitWithoutAriaLabel()

    unmount()
    expect(pinSpacers()).toHaveLength(0)
    expect(ScrollTrigger.getAll()).toHaveLength(0)
    // SplitText reverted before React removed the element: only the original text remains.
    expect(copy.querySelectorAll('div')).toHaveLength(0)
    expect(copy.textContent).toBe(i18n.t('home.intro'))
    expect(liveLenis()).toHaveLength(0)
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('[animations]'), expect.anything())
    expect(error).not.toHaveBeenCalled()
  }, MOTION_TEST_TIMEOUT_MS)

  it('leaks nothing across home -> 404 -> home and a language switch', async () => {
    renderApp('/en')
    await findHero()
    await waitFor(() => expect(liveLenis()).toHaveLength(1))
    const lenis = liveLenis()[0]
    const homeTriggers = ScrollTrigger.getAll().length

    act(() => {
      void navigation.to?.('/en/does-not-exist')
    })
    await screen.findByRole('heading', { name: 'Page not found' })
    expect(pinSpacers()).toHaveLength(0)
    expect(ScrollTrigger.getAll()).toHaveLength(1) // only the header progress rule remains

    act(() => {
      void navigation.to?.('/en')
    })
    await findHero()
    expect(pinSpacers()).toHaveLength(1)
    expect(ScrollTrigger.getAll()).toHaveLength(homeTriggers)

    act(() => {
      void navigation.to?.('/zh-hant')
    })
    await screen.findByRole('heading', { level: 2, name: '簡介' })
    expect(pinSpacers()).toHaveLength(1)
    expect(ScrollTrigger.getAll()).toHaveLength(homeTriggers)
    // One Lenis survives the language switch.
    expect(liveLenis()).toEqual([lenis])
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('[animations]'), expect.anything())
    expect(error).not.toHaveBeenCalled()
  }, MOTION_TEST_TIMEOUT_MS)

  it('refreshes a pin re-created by a height-only breakpoint change before the section triggers', async () => {
    await renderHome()
    // Only the statement's branch depends on the height, so only its triggers are re-created, last.
    setMatchMedia(shortDesktopMotionMatcher)
    act(() => fireMediaChange(MQ.pinnable, false))
    expect(pinSpacers()).toHaveLength(0)
    await nextMediaChange()
    setMatchMedia(motionMatcher)
    act(() => fireMediaChange(MQ.pinnable, true))
    expect(pinSpacers()).toHaveLength(1)

    act(() => ScrollTrigger.refresh())
    const triggers = ScrollTrigger.getAll()
    const pin = triggers.findIndex((trigger) => trigger.pin)
    expect(pin).toBeGreaterThanOrEqual(0)
    expect(triggers.findIndex(inSection)).toBeGreaterThan(pin)
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('[animations]'), expect.anything())
  }, MOTION_TEST_TIMEOUT_MS)

  it('keeps the reader in their section when a breakpoint change rebuilds the triggers', async () => {
    const { lenis } = await renderHome()
    // A fake layout: page tops and heights of <main>'s children under a 64px header.
    const children = [...document.getElementById('main')!.children]
    const heights = [736, 1600, 900, 900, 900, 900]
    let tops = [64, 800, 2400, 3300, 4200, 5100]
    let scrollY = 3500
    const original = Element.prototype.getBoundingClientRect
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY)
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const index = children.indexOf(this)
      if (index >= 0) return rect(tops[index] - scrollY, heights[index])
      if (this.matches('[data-site-header]')) return rect(0, 64)
      return original.call(this)
    })
    act(() => ScrollTrigger.refresh()) // the anchor settles 264px into Projects

    // The rebuild removes the pin spacer above the reader, and ScrollTrigger leaves the page at the top.
    tops = [64, 800, 1600, 2500, 3400, 4300]
    scrollY = 0
    lenis.scrollTo.mockClear()
    setMatchMedia(shortDesktopMotionMatcher)
    act(() => fireMediaChange(MQ.pinnable, false))

    expect(lenis.resize).toHaveBeenCalled()
    const [target, options] = lenis.scrollTo.mock.calls.at(-1)!
    expect(target).toBeCloseTo(2500 - 64 + 264)
    expect(options).toEqual({ immediate: true, force: true })
  }, MOTION_TEST_TIMEOUT_MS)

  it('builds the phone choreography without a pin and leaves nothing behind', async () => {
    setMatchMedia(mobileMotionMatcher)
    const { unmount } = await renderHome()
    expect(ScrollTrigger.getAll().length).toBeGreaterThan(20)
    expect(pinSpacers()).toHaveLength(0)
    const copy = document.querySelector<HTMLElement>('[data-split]')!
    expectStatementSplitWithoutAriaLabel()

    unmount()
    expect(ScrollTrigger.getAll()).toHaveLength(0)
    expect(copy.querySelectorAll('div')).toHaveLength(0)
    expect(liveLenis()).toHaveLength(0)
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('[animations]'), expect.anything())
    expect(error).not.toHaveBeenCalled()
  }, MOTION_TEST_TIMEOUT_MS)

  it('splits the Traditional Chinese statement by word without an aria-label', async () => {
    renderApp('/zh-hant')
    await screen.findByRole('heading', { level: 2, name: '簡介' })
    await waitFor(() => expect(liveLenis()).toHaveLength(1))
    expect(pinSpacers()).toHaveLength(1)
    expectStatementSplitWithoutAriaLabel()
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('[animations]'), expect.anything())
    expect(error).not.toHaveBeenCalled()
  }, MOTION_TEST_TIMEOUT_MS)

  it('re-measures the header progress rule for each page it outlives', async () => {
    // jsdom has no layout: give the document a height that depends on the page shown.
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(() =>
      document.getElementById('experience') ? 6000 : 1200,
    )
    const progressEnd = () => ScrollTrigger.getAll().find((trigger) => trigger.vars.end === 'max')?.end
    renderApp('/en/does-not-exist')
    await screen.findByRole('heading', { name: 'Page not found' })
    expect(progressEnd()).toBe(1200 - window.innerHeight)

    // A section link from the 404 page, then Back: the home page's triggers die with it.
    act(() => {
      void navigation.to?.('/en#projects')
    })
    await findHero()
    expect(progressEnd()).toBe(6000 - window.innerHeight)
    act(() => {
      void navigation.to?.(-1)
    })
    await screen.findByRole('heading', { name: 'Page not found' })
    expect(ScrollTrigger.getAll()).toHaveLength(1)
    expect(progressEnd()).toBe(1200 - window.innerHeight)
    expect(error).not.toHaveBeenCalled()
  }, MOTION_TEST_TIMEOUT_MS)

  it('reveals the statement without a pin on a desktop the pin does not suit', async () => {
    setMatchMedia(shortDesktopMotionMatcher)
    await renderHome()
    expect(pinSpacers()).toHaveLength(0)
    expectStatementSplitWithoutAriaLabel()
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('[animations]'), expect.anything())
    expect(error).not.toHaveBeenCalled()
  }, MOTION_TEST_TIMEOUT_MS)

  it('leaves the statement static when its setup throws', async () => {
    warn.mockImplementation(() => {})
    vi.spyOn(SplitText, 'create').mockImplementation(() => {
      throw new Error('split failed')
    })
    await renderHome()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[animations]'), expect.any(Error))
    expect(pinSpacers()).toHaveLength(0)
    const statement = screen.getByRole('region', { name: 'In brief' })
    for (const element of [statement, ...statement.querySelectorAll<HTMLElement>('*')]) {
      expect(element.style.opacity).not.toBe('0')
      expect(element.style.transform).toBe('')
    }
  }, MOTION_TEST_TIMEOUT_MS)
})
