import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MD_UP } from '../animations/media'
import { App } from '../App'
import i18n from '../i18n'
import { FakeLenis } from '../test/fakeLenis'
import { fireMediaChange, motionMatcher, setMatchMedia } from '../test/matchMedia'
import { navigation } from '../test/navigation'
import { NavigationHandle } from '../test/NavigationHandle'

vi.mock('lenis', () => import('../test/fakeLenis'))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <NavigationHandle />
    </MemoryRouter>,
  )
}

const trigger = () => screen.getByRole('button', { name: 'Open menu' })
const menu = () => document.getElementById('mobile-menu') as HTMLDialogElement
const scrolledElements = () => vi.mocked(Element.prototype.scrollIntoView).mock.contexts as Element[]

describe('MobileMenu', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
    FakeLenis.reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes the menu button state', async () => {
    renderAt('/en')
    await screen.findByRole('heading', { level: 1 })
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveAttribute('aria-controls', 'mobile-menu')
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog')
    expect(menu().open).toBe(false)
  })

  it('opens as a modal dialog and moves focus to the close button', async () => {
    const user = userEvent.setup()
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    renderAt('/en')
    await user.click(await screen.findByRole('button', { name: 'Open menu' }))
    expect(showModal).toHaveBeenCalledTimes(1)
    expect(menu().open).toBe(true)
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBe(menu())
  })

  it('closes on Escape and returns focus to the menu button', async () => {
    const user = userEvent.setup()
    renderAt('/en')
    await user.click(await screen.findByRole('button', { name: 'Open menu' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(trigger()).toHaveAttribute('aria-expanded', 'false'))
    expect(menu().open).toBe(false)
    expect(trigger()).toHaveFocus()
  })

  it('closes with the close button and returns focus to the menu button', async () => {
    const user = userEvent.setup()
    renderAt('/en')
    await user.click(await screen.findByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(menu().open).toBe(false)
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(trigger()).toHaveFocus())
  })

  it('closes, scrolls and focuses the section heading on a link tap', async () => {
    const user = userEvent.setup()
    renderAt('/en')
    await user.click(await screen.findByRole('button', { name: 'Open menu' }))
    await user.click(within(menu()).getByRole('link', { name: /Projects/ }))
    expect(menu().open).toBe(false)
    await waitFor(() => expect(scrolledElements()).toContain(document.getElementById('projects')))
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('projects-title')))
  })

  it('closes when the viewport reaches the desktop layout and moves focus to the desktop nav', async () => {
    const user = userEvent.setup()
    renderAt('/en')
    await user.click(await screen.findByRole('button', { name: 'Open menu' }))
    // The menu button is display:none from here on, so it cannot take focus back.
    setMatchMedia((query) => query === MD_UP)
    act(() => fireMediaChange(MD_UP, true))
    expect(menu().open).toBe(false)
    await waitFor(() => expect(trigger()).toHaveAttribute('aria-expanded', 'false'))
    const desktopNav = within(screen.getByRole('banner')).getByRole('navigation', { name: 'Primary navigation' })
    await waitFor(() => expect(within(desktopNav).getByRole('link', { name: 'Experience' })).toHaveFocus())
  })

  it('closes on a route change', async () => {
    const user = userEvent.setup()
    renderAt('/en')
    await user.click(await screen.findByRole('button', { name: 'Open menu' }))
    act(() => {
      void navigation.to?.('/en/does-not-exist')
    })
    await screen.findByRole('heading', { name: 'Page not found' })
    expect(menu().open).toBe(false)
    await waitFor(() => expect(trigger()).toHaveAttribute('aria-expanded', 'false'))
  })

  it('does not duplicate the theme or language controls', async () => {
    const user = userEvent.setup()
    renderAt('/en')
    await user.click(await screen.findByRole('button', { name: 'Open menu' }))
    expect(screen.getAllByRole('button', { name: 'Switch to dark mode' })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: 'Switch language to 繁體中文' })).toHaveLength(1)
    expect(within(menu()).queryByRole('button', { name: 'Switch to dark mode' })).toBeNull()
  })

  describe('with motion allowed (Lenis)', () => {
    beforeEach(() => {
      setMatchMedia(motionMatcher)
    })

    it('stops Lenis while open, restarts it on close and scrolls through it on a link tap', async () => {
      const user = userEvent.setup()
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      await waitFor(() => expect(FakeLenis.instances).toHaveLength(1))
      const lenis = FakeLenis.instances[0]

      await user.click(trigger())
      expect(lenis.stop).toHaveBeenCalledTimes(1)
      await user.click(screen.getByRole('button', { name: 'Close menu' }))
      expect(lenis.start).toHaveBeenCalled()

      lenis.start.mockClear()
      await user.click(trigger())
      await user.click(within(menu()).getByRole('link', { name: /Projects/ }))
      expect(lenis.start).toHaveBeenCalled()
      const projects = document.getElementById('projects')
      await waitFor(() =>
        expect(lenis.scrollTo).toHaveBeenCalledWith(projects, expect.objectContaining({ force: true })),
      )
      await waitFor(() => expect(document.activeElement).toBe(document.getElementById('projects-title')))
    })

    it('closes on a language switch and restarts Lenis', async () => {
      const user = userEvent.setup()
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      await waitFor(() => expect(FakeLenis.instances).toHaveLength(1))
      const lenis = FakeLenis.instances[0]

      await user.click(trigger())
      expect(lenis.stop).toHaveBeenCalledTimes(1)
      lenis.start.mockClear()
      act(() => {
        void navigation.to?.('/zh-hant')
      })
      const reopen = await screen.findByRole('button', { name: '開啟選單' })
      expect(reopen).toHaveAttribute('aria-expanded', 'false')
      expect(menu().open).toBe(false)
      expect(lenis.start).toHaveBeenCalled()
      expect(FakeLenis.instances).toEqual([lenis])
    })
  })
})
