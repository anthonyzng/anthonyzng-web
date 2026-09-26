import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLayoutEffect, type ReactNode } from 'react'
import { MemoryRouter, type InitialEntry } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import i18n from '../i18n'
import { navigation } from '../test/navigation'
import { NavigationHandle } from '../test/NavigationHandle'
import { MockIntersectionObserver } from '../test/observers'

function renderAt(entry: InitialEntry, after?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
      <NavigationHandle />
      {after}
    </MemoryRouter>,
  )
}

/**
 * Rendered after <App />: its layout effect runs once every layout effect of the app has, and before
 * any passive effect. act() flushes both, so only this can tell a pre-paint landing from a later one.
 */
function LayoutPhaseProbe({ onLayoutPhase }: { onLayoutPhase: () => void }) {
  useLayoutEffect(onLayoutPhase, [onLayoutPhase])
  return null
}

const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
const scrolledElements = () => scrollIntoView.mock.contexts as Element[]
const byId = (id: string) => document.getElementById(id)

const SECTIONS = [
  { id: 'experience', title: 'Experience', tagline: 'A timeline of roles and responsibilities.' },
  { id: 'projects', title: 'Projects', tagline: 'Selected work and the technology behind it.' },
  { id: 'skills', title: 'Skills', tagline: 'Languages, frameworks and tools.' },
] as const

async function headerNav() {
  const banner = await screen.findByRole('banner')
  return { banner, nav: within(banner).getByRole('navigation', { name: 'Primary navigation' }) }
}

describe('HomePage (static path: no motion)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
  })

  it('renders the hero, the statement and four section shells', async () => {
    renderAt('/en')
    expect(await screen.findByRole('heading', { level: 1, name: 'Anthony Ng' })).toBeInTheDocument()
    for (const role of ['Full Stack Software Developer', 'AI Developer', 'Assistant Manager, Software Development']) {
      expect(screen.getByText(role)).toBeInTheDocument()
    }
    expect(screen.getByRole('region', { name: 'In brief' })).toBeInTheDocument()

    for (const { id, title, tagline } of SECTIONS) {
      const region = screen.getByRole('region', { name: title })
      expect(region).toHaveAttribute('id', id)
      expect(within(region).getByRole('heading', { level: 2, name: title })).toHaveAttribute('tabindex', '-1')
      expect(within(region).getByText(tagline)).toBeInTheDocument()
    }
    expect(screen.getByText('03 / 03')).toBeInTheDocument()
    // Contact is the closing screen: a landing target with a focusable heading, not a numbered chapter.
    const contact = screen.getByRole('region', { name: 'Get in touch' })
    expect(contact).toHaveAttribute('id', 'contact')
    expect(within(contact).getByRole('heading', { level: 2, name: 'Get in touch' })).toHaveAttribute('tabindex', '-1')
  })

  it('renders the statement as a screen-reader copy plus an aria-hidden visual copy', async () => {
    renderAt('/en')
    await screen.findByRole('heading', { level: 1 })
    const copies = screen.getAllByText(i18n.t('home.intro'))
    expect(copies).toHaveLength(2)
    expect(copies.filter((copy) => copy.classList.contains('sr-only'))).toHaveLength(1)
    expect(copies.filter((copy) => copy.getAttribute('aria-hidden') === 'true')).toHaveLength(1)
    expect(copies.every((copy) => !copy.hasAttribute('aria-label'))).toBe(true)
  })

  it('links the header nav to localized section anchors', async () => {
    renderAt('/en')
    const { nav } = await headerNav()
    expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/en#experience',
      '/en#projects',
      '/en#skills',
      '/en#contact',
    ])
  })

  it('renders the sections in Traditional Chinese under /zh-hant', async () => {
    renderAt('/zh-hant')
    for (const title of ['工作經驗', '項目作品', '技能', '保持聯絡']) {
      expect(await screen.findByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { level: 2, name: '簡介' })).toBeInTheDocument()
    expect(screen.getByText('精選項目內容正在整理中。')).toBeInTheDocument()
  })

  it('leaves no hidden or transformed inline styles without motion', async () => {
    renderAt('/en')
    await screen.findByRole('heading', { level: 1 })
    for (const element of screen.getByRole('main').querySelectorAll<HTMLElement>('*')) {
      expect(element.style.opacity).not.toBe('0')
      expect(element.style.transform).toBe('')
      expect(element.style.visibility).toBe('')
    }
  })

  it('scrolls to a section, focuses its heading and updates the hash on a nav click', async () => {
    const user = userEvent.setup()
    renderAt('/en')
    const { nav } = await headerNav()
    await user.click(within(nav).getByRole('link', { name: 'Contact' }))

    await waitFor(() => expect(scrolledElements()).toContain(byId('contact')))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    expect(document.activeElement).toBe(byId('contact-title'))
    await waitFor(() => expect(navigation.location?.hash).toBe('#contact'))
  })

  it('switches language to the section being read, never to a stale URL hash', async () => {
    const user = userEvent.setup()
    renderAt('/en')
    const { banner, nav } = await headerNav()
    const switcher = () => within(banner).getByRole('link', { name: 'Switch language to 繁體中文' })
    await user.click(within(nav).getByRole('link', { name: 'Contact' }))
    await waitFor(() => expect(navigation.location?.hash).toBe('#contact'))

    const contact = byId('contact')!
    const observer = MockIntersectionObserver.instances.find((instance) => instance.targets.has(contact))
    act(() => observer?.trigger([{ target: contact, isIntersecting: true }]))
    expect(switcher()).toHaveAttribute('href', '/zh-hant#contact')

    // Scrolled back up to the hero: the URL still says #contact, but the reader is at the top.
    act(() => observer?.trigger([{ target: contact, isIntersecting: false }]))
    expect(navigation.location?.hash).toBe('#contact')
    expect(switcher()).toHaveAttribute('href', '/zh-hant')
  })

  it('switches language from the statement back to the statement, not to the top', async () => {
    const user = userEvent.setup()
    renderAt('/en')
    const { banner, nav } = await headerNav()
    const statement = byId('statement')!
    const observer = MockIntersectionObserver.instances.find((instance) => instance.targets.has(statement))
    act(() => observer?.trigger([{ target: statement, isIntersecting: true }]))
    // The statement has no nav link, so nothing in the nav is current.
    for (const link of within(nav).getAllByRole('link')) expect(link).not.toHaveAttribute('aria-current')
    const switcher = within(banner).getByRole('link', { name: 'Switch language to 繁體中文' })
    expect(switcher).toHaveAttribute('href', '/zh-hant#statement')

    vi.mocked(window.scrollTo).mockClear()
    await user.click(switcher)
    await screen.findByRole('heading', { level: 2, name: '簡介' })
    expect(scrolledElements()).toContain(byId('statement'))
    expect(window.scrollTo).not.toHaveBeenCalledWith(0, 0)
    await waitFor(() => expect(screen.getByRole('link', { name: '切換語言至English' })).toHaveFocus())
  })

  it('keeps the reading position inside the statement across a language switch', async () => {
    const user = userEvent.setup()
    // The page remounts on a switch: the old statement is half-way past the reading line,
    // the re-laid-out new one starts further down.
    let before: Element | null = null
    const realRect = Element.prototype.getBoundingClientRect
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.id !== 'statement') return realRect.call(this)
      const top = this === before ? -500 : 1000
      return { top, height: 1000, bottom: top + 1000, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }
    })
    try {
      renderAt('/en')
      const { banner } = await headerNav()
      before = byId('statement')!
      const observer = MockIntersectionObserver.instances.find((instance) => instance.targets.has(before!))
      act(() => observer?.trigger([{ target: before!, isIntersecting: true }]))

      vi.mocked(window.scrollTo).mockClear()
      await user.click(within(banner).getByRole('link', { name: 'Switch language to 繁體中文' }))
      await screen.findByRole('heading', { level: 2, name: '簡介' })
      expect(byId('statement')).not.toBe(before)
      // scrollY 0 + new top 1000 - header 0 (no layout in jsdom) + 0.5 * 1000
      await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith(0, 1500))
      expect(navigation.location?.state).toMatchObject({ focus: 'language', progress: 0.5 })
    } finally {
      spy.mockRestore()
    }
  })

  it('does not replay a carried reading position from history', async () => {
    renderAt({ pathname: '/zh-hant', hash: '#statement', state: { focus: 'language', progress: 0.5 } })
    await screen.findByRole('heading', { level: 2, name: '簡介' })
    expect(scrolledElements()).toContain(byId('statement'))
    // A reload or Back is a POP: land on the statement's start, ignore the stored progress.
    expect(window.scrollTo).not.toHaveBeenCalledWith(0, expect.any(Number))
  })

  it('marks only the visible autonym with the target language, not the accessible name', async () => {
    renderAt('/en')
    const { banner } = await headerNav()
    const link = within(banner).getByRole('link', { name: 'Switch language to 繁體中文' })
    expect(link).not.toHaveAttribute('lang')
    expect(link).toHaveAttribute('hreflang', 'zh-Hant')
    expect(within(link).getByText('繁')).toHaveAttribute('lang', 'zh-Hant')
  })

  it('lands a deep link before the first paint without moving focus', async () => {
    let landedInLayoutPhase: Element[] | null = null
    const onLayoutPhase = () => {
      landedInLayoutPhase ??= [...scrolledElements()]
    }
    renderAt('/en#skills', <LayoutPhaseProbe onLayoutPhase={onLayoutPhase} />)
    // In the mount's layout phase, before any passive effect: the hero is never painted first.
    expect(landedInLayoutPhase).toContain(byId('skills'))
    await screen.findByRole('heading', { level: 1 })
    // The post-fonts correction lands it again.
    await waitFor(() => expect(scrolledElements().filter((element) => element === byId('skills'))).toHaveLength(2))
    expect(document.activeElement).not.toBe(byId('skills-title'))
  })

  it('sets <html lang> before the deep link of a returning visitor is measured and landed', async () => {
    await i18n.changeLanguage('zh-Hant') // detected from storage, so there is no catch-up frame
    document.documentElement.lang = 'en' // as served by index.html
    const langAtLanding: string[] = []
    const land = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {
      langAtLanding.push(document.documentElement.lang)
    })
    try {
      renderAt('/zh-hant#skills')
      // html:lang(zh-Hant) changes line heights: the landing must be measured with them.
      expect(langAtLanding[0]).toBe('zh-Hant')
      expect(document.title).toBe(i18n.t('meta.title'))
    } finally {
      land.mockRestore()
    }
  })

  it('names each language version for search engines and link previews', async () => {
    const head = (selector: string, attribute = 'content') => document.head.querySelector(selector)?.getAttribute(attribute)
    const view = renderAt('/en')
    await headerNav()
    expect(head('meta[name="description"]')).toBe(i18n.t('meta.description', { lng: 'en' }))
    expect(head('link[rel="canonical"]', 'href')).toBe('https://owwsolution.com/en')
    expect(head('meta[property="og:url"]')).toBe('https://owwsolution.com/en')
    expect(head('meta[property="og:locale"]')).toBe('en_US')
    expect(head('meta[property="og:locale:alternate"]')).toBe('zh_HK')
    view.unmount()

    renderAt('/zh-hant')
    await waitFor(() => expect(head('link[rel="canonical"]', 'href')).toBe('https://owwsolution.com/zh-hant'))
    expect(head('meta[name="description"]')).toBe(i18n.t('meta.description', { lng: 'zh-Hant' }))
    expect(head('meta[property="og:title"]')).toBe(i18n.t('meta.title', { lng: 'zh-Hant' }))
    expect(head('meta[property="og:locale"]')).toBe('zh_HK')
    expect(head('meta[property="og:locale:alternate"]')).toBe('en_US')
    // One of each, however often the language changes.
    expect(document.head.querySelectorAll('link[rel="canonical"], meta[name="description"]')).toHaveLength(2)
  })

  it('keeps the 404 page out of search results, and only that page', async () => {
    const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null
    const view = renderAt('/en/no-such-page')
    await screen.findByRole('heading', { level: 1 })
    expect(robots()).toBe('noindex')
    view.unmount()
    expect(robots()).toBeNull()
  })

  it('navigates from the 404 page to a section, lands it and focuses its heading', async () => {
    const user = userEvent.setup()
    renderAt('/en/does-not-exist')
    await screen.findByRole('heading', { name: 'Page not found' })
    const { nav } = await headerNav()
    const link = within(nav).getByRole('link', { name: 'Projects' })
    expect(link).toHaveAttribute('href', '/en#projects')
    await user.click(link)
    await waitFor(() => expect(scrolledElements()).toContain(byId('projects')))
    expect(document.activeElement).toBe(byId('projects-title'))
  })

  it('returns focus to the language switcher after a language switch', async () => {
    const user = userEvent.setup()
    renderAt('/en')
    const { banner } = await headerNav()
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    try {
      await user.click(within(banner).getByRole('link', { name: 'Switch language to 繁體中文' }))
      const back = await screen.findByRole('link', { name: '切換語言至English' })
      await waitFor(() => expect(back).toHaveFocus())
      // The header is sticky: focusing into it must never scroll the page away from where it landed.
      expect(focus.mock.calls[focus.mock.contexts.indexOf(back)]).toEqual([{ preventScroll: true }])
    } finally {
      focus.mockRestore()
    }
  })

  it('never replays a focus request from history on Back', async () => {
    const user = userEvent.setup()
    renderAt('/en/does-not-exist')
    const { banner } = await headerNav()
    await user.click(within(banner).getByRole('link', { name: 'Switch language to 繁體中文' }))
    await waitFor(() => expect(screen.getByRole('link', { name: '切換語言至English' })).toHaveFocus())
    const nav = within(screen.getByRole('banner')).getByRole('navigation', { name: '主要導覽' })
    await user.click(within(nav).getByRole('link', { name: '項目作品' }))
    await waitFor(() => expect(document.activeElement).toBe(byId('projects-title')))

    // Back to the entry the language switch pushed: its history state still asks for the switcher.
    act(() => {
      void navigation.to?.(-1)
    })
    await screen.findByRole('heading', { name: '找不到頁面' })
    expect(screen.getByRole('link', { name: '切換語言至English' })).not.toHaveFocus()

    // Forward, then away and Back to the entry the section link pushed: it lands, but keeps focus put.
    act(() => {
      void navigation.to?.(1)
    })
    await screen.findByRole('heading', { level: 1 })
    expect(document.activeElement).not.toBe(byId('projects-title'))
    act(() => {
      void navigation.to?.('/zh-hant/does-not-exist')
    })
    await screen.findByRole('heading', { name: '找不到頁面' })
    scrollIntoView.mockClear()
    act(() => {
      void navigation.to?.(-1)
    })
    await screen.findByRole('heading', { level: 1 })
    expect(scrolledElements()).toContain(byId('projects'))
    expect(document.activeElement).not.toBe(byId('projects-title'))
  })

  it('never replays a focus request from history on a reload', async () => {
    const { unmount } = renderAt({ pathname: '/zh-hant/does-not-exist', state: { focus: 'language' } })
    await screen.findByRole('heading', { name: '找不到頁面' })
    expect(screen.getByRole('link', { name: '切換語言至English' })).not.toHaveFocus()
    unmount()

    await i18n.changeLanguage('en')
    renderAt({ pathname: '/en', hash: '#projects', state: { focus: 'section' } })
    await screen.findByRole('heading', { level: 1 })
    expect(scrolledElements()).toContain(byId('projects'))
    expect(document.activeElement).not.toBe(byId('projects-title'))
  })

  it('returns to the top of another page whose hash it does not land', async () => {
    const user = userEvent.setup()
    renderAt('/en/does-not-exist#main') // after the skip link
    const { nav } = await headerNav()
    await user.click(within(nav).getByRole('link', { name: 'Projects' }))
    await waitFor(() => expect(scrolledElements()).toContain(byId('projects')))
    vi.mocked(window.scrollTo).mockClear()
    act(() => {
      void navigation.to?.(-1)
    })
    await screen.findByRole('heading', { name: 'Page not found' })
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('scrolls to the top when the logo is clicked on the home page', async () => {
    const user = userEvent.setup()
    renderAt('/en')
    const { banner } = await headerNav()
    await user.click(within(banner).getByRole('link', { name: 'anthonyzng.' }))
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })

  it('marks the active section in the nav and clears it when the page unmounts', async () => {
    renderAt('/en')
    const { banner, nav } = await headerNav()
    const projects = byId('projects')!
    const observer = MockIntersectionObserver.instances.find((instance) => instance.targets.has(projects))
    expect(observer).toBeDefined()
    expect(observer?.rootMargin).toBe('-45% 0px -50% 0px')

    act(() => observer?.trigger([{ target: projects, isIntersecting: true }]))
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'true')
    for (const name of ['Experience', 'Skills', 'Contact']) {
      expect(within(nav).getByRole('link', { name })).not.toHaveAttribute('aria-current')
    }
    // Switching language keeps the reader's section.
    expect(within(banner).getByRole('link', { name: 'Switch language to 繁體中文' })).toHaveAttribute(
      'href',
      '/zh-hant#projects',
    )

    act(() => {
      void navigation.to?.('/en/does-not-exist')
    })
    await screen.findByRole('heading', { name: 'Page not found' })
    for (const link of within(nav).getAllByRole('link')) expect(link).not.toHaveAttribute('aria-current')
  })
})
