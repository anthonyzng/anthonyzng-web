import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReadingGlass } from '../components/ReadingGlass'
import { motionMatcher, setMatchMedia } from '../test/matchMedia'
import { SECTION_FADE } from './motion'
import { useSectionFades } from './useSectionFades'

function Page() {
  useSectionFades('')
  return (
    <>
      <section data-hero>Hero</section>
      <section id="experience">
        <ReadingGlass className="inset-0" />
        <span data-fade>Ghost</span>
        <div data-fade>Content</div>
      </section>
    </>
  )
}

const rect = (top: number, height: number) =>
  ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

describe('useSectionFades', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fades a section without a glass itself, and the layers beside a glass, never their section', () => {
    setMatchMedia(motionMatcher)
    const vh = window.innerHeight
    // The hero is leaving (its foot a third of the band from the top); the experience is half way into the band below.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.matches('[data-hero]')) return rect(-vh + (vh * SECTION_FADE.band) / 3, vh)
      if (this.id === 'experience') return rect(vh - (vh * SECTION_FADE.band) / 2, 2000)
      return rect(0, 0)
    })
    const { container, unmount } = render(<Page />)
    const hero = container.querySelector<HTMLElement>('[data-hero]')!
    const experience = container.querySelector<HTMLElement>('#experience')!
    const layers = [...experience.querySelectorAll<HTMLElement>('[data-fade]')]

    // smoothstep(1/3) = 7/27; smoothstep(1/2) = 1/2.
    expect(hero.style.opacity).toBe('0.259')
    expect(experience.style.opacity).toBe('')
    for (const layer of layers) expect(layer.style.opacity).toBe('0.5')
    // The glass follows through the variable; its own ancestors stay at full opacity.
    expect(experience.style.getPropertyValue('--section-fade')).toBe('0.5')
    expect(experience.querySelector<HTMLElement>('[data-glass]')!.style.opacity).toBe('')

    unmount()
    for (const layer of layers) expect(layer.style.opacity).toBe('')
    expect(experience.style.getPropertyValue('--section-fade')).toBe('')
  })
})
