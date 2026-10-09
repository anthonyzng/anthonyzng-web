import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gsap } from '../animations/gsap'
import { motionMatcher, setMatchMedia } from '../test/matchMedia'
import { PageGlass } from './PageGlass'

const rect = (top: number, height: number, left = 40, width = 1000) =>
  ({ top, bottom: top + height, height, left, right: left + width, width, x: left, y: top, toJSON: () => ({}) }) as DOMRect

/** Where each content box is on screen; the test moves them as a scroll would. */
const boxTops: Record<string, number> = {}

function Page() {
  return (
    <>
      <div data-glass-box id="one" />
      <div data-glass-box id="two" />
      <PageGlass sectionsKey="" />
    </>
  )
}

const glass = () => document.body.querySelector<HTMLElement>(':scope > .page-glass')!

describe('PageGlass', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function mockBoxes() {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.id in boxTops) return rect(boxTops[this.id], 600)
      return rect(0, 0)
    })
  }

  it('wraps the content box nearest the middle of the screen, clipped to the screen, outside the page content', () => {
    // jsdom: a 768px screen; no header rendered, so it is taken as 64px.
    boxTops.one = -900
    boxTops.two = 200
    mockBoxes()
    render(<Page />)
    const pane = glass()
    expect(pane).toHaveAttribute('aria-hidden', 'true')
    // Box two (top 200, 600 tall, padded 40px) is nearest the middle; its foot is clipped 12px above the screen's.
    expect(pane.style.transform).toMatch(/^translate3d\(44(\.0)?px, 160(\.0)?px, 0(px)?\)$/)
    expect(parseFloat(pane.style.width)).toBe(992)
    expect(parseFloat(pane.style.height)).toBe(768 - 12 - 160)
    expect(parseFloat(pane.style.opacity)).toBe(1)
    expect(pane.style.visibility).toBe('visible')
  })

  it('hides itself where no content box is on screen (the hero, the contact screen)', () => {
    boxTops.one = 900
    boxTops.two = 1700
    mockBoxes()
    render(<Page />)
    expect(glass().style.visibility).toBe('hidden')
  })

  it('fades out while the page moves and back in once the scroll rests', () => {
    setMatchMedia(motionMatcher)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const frames = (n: number) => {
      for (let i = 0; i < n; i++) {
        now += 50
        gsap.ticker.tick()
      }
    }
    boxTops.one = 100
    boxTops.two = 900
    mockBoxes()
    const { unmount } = render(<Page />)
    expect(parseFloat(glass().style.opacity)).toBe(1)

    act(() => {
      window.dispatchEvent(new Event('scroll'))
      frames(10)
    })
    expect(parseFloat(glass().style.opacity)).toBeLessThan(0.01)
    expect(glass().style.visibility).toBe('hidden')

    act(() => {
      vi.advanceTimersByTime(220)
      frames(30)
    })
    expect(parseFloat(glass().style.opacity)).toBe(1)
    expect(glass().style.visibility).toBe('visible')
    unmount()
    expect(document.body.querySelector('.page-glass')).toBeNull()
  })

  it('stays in place while the page moves under reduced motion', () => {
    boxTops.one = 100
    boxTops.two = 900
    mockBoxes()
    render(<Page />)
    act(() => {
      window.dispatchEvent(new Event('scroll'))
      gsap.ticker.tick()
    })
    expect(parseFloat(glass().style.opacity)).toBe(1)
  })
})
