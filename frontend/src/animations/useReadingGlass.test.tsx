import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReadingGlass } from '../components/ReadingGlass'
import { MockIntersectionObserver } from '../test/observers'
import { useReadingGlass } from './useReadingGlass'

function Page() {
  useReadingGlass('')
  return (
    <>
      <section id="one">
        <ReadingGlass className="inset-0" />
        <p data-fade>One</p>
      </section>
      <section id="two">
        <ReadingGlass className="inset-0" />
        <p data-fade>Two</p>
      </section>
      <section id="plain">No glass</section>
    </>
  )
}

const root = document.documentElement

describe('useReadingGlass', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks the section being read, and only the sections that carry a glass', () => {
    const { container } = render(<Page />)
    const [one, two, plain] = container.querySelectorAll('section')
    const glass = container.querySelector('[data-glass]')
    expect(glass).toHaveAttribute('aria-hidden', 'true')
    expect(glass).toHaveClass('reading-glass')

    const observer = MockIntersectionObserver.instances.find((instance) => instance.targets.has(one))!
    expect(observer.targets.has(two)).toBe(true)
    expect(observer.targets.has(plain)).toBe(false)

    act(() => observer.trigger([{ target: one, isIntersecting: true }]))
    expect(one).toHaveAttribute('data-glass-active')
    expect(two).not.toHaveAttribute('data-glass-active')

    act(() => observer.trigger([{ target: one, isIntersecting: false }, { target: two, isIntersecting: true }]))
    expect(one).not.toHaveAttribute('data-glass-active')
    expect(two).toHaveAttribute('data-glass-active')
  })

  it('marks the page as scrolling until the scroll rests, and cleans up on unmount', () => {
    vi.useFakeTimers()
    const { container, unmount } = render(<Page />)
    const one = container.querySelector('section')!
    const observer = MockIntersectionObserver.instances.find((instance) => instance.targets.has(one))!
    act(() => observer.trigger([{ target: one, isIntersecting: true }]))

    window.dispatchEvent(new Event('scroll'))
    expect(root).toHaveAttribute('data-scrolling')
    vi.advanceTimersByTime(150)
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(150)
    // Still moving: the rest timer starts again with every scroll event.
    expect(root).toHaveAttribute('data-scrolling')
    vi.advanceTimersByTime(100)
    expect(root).not.toHaveAttribute('data-scrolling')

    window.dispatchEvent(new Event('scroll'))
    unmount()
    expect(root).not.toHaveAttribute('data-scrolling')
    expect(one).not.toHaveAttribute('data-glass-active')
  })
})
