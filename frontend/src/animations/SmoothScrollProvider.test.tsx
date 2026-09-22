import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navigation } from '../test/navigation'
import { NavigationHandle } from '../test/NavigationHandle'
import { FakeLenis } from '../test/fakeLenis'
import { motionMatcher, setMatchMedia } from '../test/matchMedia'
import { gsap, ScrollTrigger } from './gsap'
import { SmoothScrollProvider } from './SmoothScrollProvider'
import { useLenis } from './useSmoothScroll'

vi.mock('lenis', () => import('../test/fakeLenis'))

function Probe() {
  const lenis = useLenis()
  return <p>{lenis ? 'lenis' : 'no lenis'}</p>
}

function renderProvider(path = '/en') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SmoothScrollProvider>
        <Probe />
        <NavigationHandle />
      </SmoothScrollProvider>
    </MemoryRouter>,
  )
}

describe('SmoothScrollProvider', () => {
  beforeEach(() => {
    FakeLenis.reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates one Lenis driven by the gsap ticker and tears it down on unmount', async () => {
    setMatchMedia(motionMatcher)
    const add = vi.spyOn(gsap.ticker, 'add')
    const remove = vi.spyOn(gsap.ticker, 'remove')
    const lagSmoothing = vi.spyOn(gsap.ticker, 'lagSmoothing')

    const { unmount } = renderProvider()
    expect(await screen.findByText('lenis')).toBeInTheDocument()
    expect(FakeLenis.instances).toHaveLength(1)
    const lenis = FakeLenis.instances[0]
    expect(lenis.options).toEqual(expect.objectContaining({ autoRaf: false, anchors: false, syncTouch: false }))
    expect(lenis.on).toHaveBeenCalledWith('scroll', ScrollTrigger.update)

    const tick = add.mock.calls.at(-1)?.[0]
    expect(tick).toBeTypeOf('function')
    tick?.(2, 0, 0, 0)
    expect(lenis.raf).toHaveBeenCalledWith(2000)
    expect(lagSmoothing).toHaveBeenCalledWith(0)

    unmount()
    expect(lenis.destroy).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith(tick)
    expect(lagSmoothing).toHaveBeenLastCalledWith(500, 33)
  })

  it('never creates Lenis without a positive no-preference motion match', () => {
    renderProvider()
    expect(screen.getByText('no lenis')).toBeInTheDocument()
    expect(FakeLenis.instances).toHaveLength(0)
  })

  it('falls back to native scrolling when the Lenis constructor throws', () => {
    setMatchMedia(motionMatcher)
    FakeLenis.throwOnConstruct = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderProvider()
    expect(screen.getByText('no lenis')).toBeInTheDocument()
    expect(warn).toHaveBeenCalled()
  })

  it('switches history scroll restoration to manual while mounted, surviving ScrollTrigger refreshes', () => {
    Object.defineProperty(window.history, 'scrollRestoration', { value: 'auto', writable: true, configurable: true })
    try {
      const { unmount } = renderProvider()
      expect(window.history.scrollRestoration).toBe('manual')
      // Every refresh writes ScrollTrigger's stored value back to history.scrollRestoration.
      ScrollTrigger.refresh()
      expect(window.history.scrollRestoration).toBe('manual')
      unmount()
      expect(window.history.scrollRestoration).toBe('auto')
    } finally {
      Reflect.deleteProperty(window.history, 'scrollRestoration')
    }
  })

  it('resets the scroll on a new pathname, unless the home page lands its hash', async () => {
    renderProvider('/en/elsewhere')
    act(() => {
      void navigation.to?.('/en#projects')
    })
    act(() => {
      void navigation.to?.('/zh-hant#statement')
    })
    expect(window.scrollTo).not.toHaveBeenCalled()

    // Only the home page lands a hash, and only one of its own regions: any other keeps no stale offset.
    for (const path of ['/zh-hant/elsewhere#main', '/en#main', '/en/elsewhere#projects', '/zh-hant']) {
      vi.mocked(window.scrollTo).mockClear()
      act(() => {
        void navigation.to?.(path)
      })
      await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith(0, 0))
    }
  })

  it('resets through Lenis when it exists', async () => {
    setMatchMedia(motionMatcher)
    renderProvider('/en/elsewhere')
    await screen.findByText('lenis')
    act(() => {
      void navigation.to?.('/en')
    })
    const lenis = FakeLenis.instances[0]
    await waitFor(() => expect(lenis.scrollTo).toHaveBeenCalledWith(0, { immediate: true, force: true }))
  })
})
