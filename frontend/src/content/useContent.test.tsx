import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScrollTrigger } from '../animations/gsap'
import { App } from '../App'
import i18n from '../i18n'
import { fetchCalls, jsonResponse, queueDeferred, queueJson } from '../test/api'
import { resolveStaticContent, type Locale, type ResolvedContent } from './resolved'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

const staticContent = (locale: Locale) => resolveStaticContent(i18n.getFixedT(locale), locale)
const STATIC_ROLE = 'Software Developer / Assistant Manager'
const role = (name: string) => screen.queryByRole('heading', { level: 3, name })
/** Lets every queued response settle, so "nothing changed" is a claim, not a race. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

/** The static English content with changes only the API could know about. */
function apiContent(): ResolvedContent {
  const content = structuredClone(staticContent('en')) as {
    -readonly [K in keyof ResolvedContent]: ResolvedContent[K]
  }
  const [current, ...rest] = content.experience
  content.experience = [
    { ...current, role: 'Lead Developer (from the API)', bullets: [...current.bullets, 'A bullet only the API knows.'] },
    ...rest,
  ]
  content.skills = {
    ...content.skills,
    groups: content.skills.groups.map((group) =>
      group.id === 'frontend' ? { ...group, items: [...group.items, 'Svelte'] } : group,
    ),
  }
  content.contact = { ...content.contact, location: 'Toronto, Canada' }
  return content
}

describe('useContent', () => {
  let refresh: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
    refresh = vi.spyOn(ScrollTrigger, 'refresh')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('paints the static snapshot at once, then swaps the API content in and re-measures the triggers', async () => {
    const pending = queueDeferred()
    renderAt('/en')
    // Synchronously, before any response: the page is complete from the static content.
    expect(role(STATIC_ROLE)).toBeInTheDocument()
    expect(fetchCalls()).toEqual([
      { url: 'http://localhost:8000/api/v1/content?locale=en', init: expect.objectContaining({ credentials: 'omit' }) },
    ])
    // A simple request: no custom headers, so no preflight.
    expect(fetchCalls()[0].init?.headers).toBeUndefined()
    refresh.mockClear()

    pending.resolve(jsonResponse(apiContent()))
    expect(await screen.findByRole('heading', { level: 3, name: 'Lead Developer (from the API)' })).toBeInTheDocument()
    expect(role(STATIC_ROLE)).toBeNull()
    expect(screen.getByText('A bullet only the API knows.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Front-end' })).getByText('Svelte')).toBeInTheDocument()
    expect(screen.getByText('Toronto, Canada')).toBeInTheDocument()
    expect(screen.queryByText('Ontario, Canada')).toBeNull()
    // The section heights changed: the safe (debounced, scroll-end aware) refresh was requested.
    // It runs in a passive effect after the swap renders, so wait for it rather than race it.
    await waitFor(() => expect(refresh).toHaveBeenCalledWith(true))
  })

  it('keeps the reader on their section when the swap changes the height above it', async () => {
    // Contact sits under the reading line on the static page; the API's longer Experience section
    // pushes it 300px down. The reader (landed on #contact, say) must follow it, before any paint.
    const swapped = () => document.body.textContent?.includes('Lead Developer (from the API)') ?? false
    const realRect = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.id !== 'contact') return realRect.call(this)
      const top = swapped() ? 300 : 0
      return { top, height: 500, bottom: top + 500, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }
    })
    const pending = queueDeferred()
    renderAt('/en')
    vi.mocked(window.scrollTo).mockClear()

    pending.resolve(jsonResponse(apiContent()))
    await screen.findByRole('heading', { level: 3, name: 'Lead Developer (from the API)' })
    expect(window.scrollTo).toHaveBeenCalledWith(0, 300)
  })

  it('keeps the static content when the API cannot be reached', async () => {
    renderAt('/en') // the default fetch stub rejects
    await waitFor(() => expect(fetchCalls()).toHaveLength(1))
    await settle()
    expect(role(STATIC_ROLE)).toBeInTheDocument()
    expect(screen.getByText('Ontario, Canada')).toBeInTheDocument()
  })

  it('keeps the static content on a non-200 response', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    queueJson({ error: { code: 'service_unavailable', message: 'Database unavailable.' } }, { status: 503 })
    renderAt('/en')
    await waitFor(() => expect(warn).toHaveBeenCalledWith('[content] static content kept', expect.any(Error)))
    expect(role(STATIC_ROLE)).toBeInTheDocument()
  })

  it('rejects a malformed payload and keeps the static content', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    queueJson({ locale: 'en', experience: 'not a list', projects: [], skills: {}, contact: {} })
    renderAt('/en')
    await waitFor(() => expect(warn).toHaveBeenCalledWith('[content] static content kept', expect.any(Error)))
    expect(role(STATIC_ROLE)).toBeInTheDocument()
    expect(screen.getByText('Ontario, Canada')).toBeInTheDocument()
  })

  it('discards a valid payload for another locale', async () => {
    queueJson({ ...apiContent(), locale: 'zh-Hant' })
    renderAt('/en')
    await waitFor(() => expect(fetchCalls()).toHaveLength(1))
    await settle()
    expect(role(STATIC_ROLE)).toBeInTheDocument()
    expect(role('Lead Developer (from the API)')).toBeNull()
  })

  it('does not re-render or re-measure for a payload identical to the static snapshot', async () => {
    const pending = queueDeferred()
    renderAt('/en')
    const heading = role(STATIC_ROLE)!
    await settle()
    refresh.mockClear()
    pending.resolve(jsonResponse(staticContent('en')))
    await settle()
    expect(role(STATIC_ROLE)).toBe(heading)
    expect(refresh).not.toHaveBeenCalledWith(true)
  })

  it('refetches for the new locale when the language changes', async () => {
    const user = userEvent.setup()
    renderAt('/en')
    await waitFor(() => expect(fetchCalls()).toHaveLength(1))
    await user.click(await screen.findByRole('link', { name: 'Switch language to 繁體中文' }))
    await screen.findByRole('heading', { level: 2, name: '工作經驗' })
    await waitFor(() =>
      expect(fetchCalls().map((call) => call.url)).toEqual([
        'http://localhost:8000/api/v1/content?locale=en',
        'http://localhost:8000/api/v1/content?locale=zh-Hant',
      ]),
    )
  })

  it('renders the Chinese payload from the API', async () => {
    const content = structuredClone(staticContent('zh-Hant')) as { experience: ResolvedContent['experience'] }
    content.experience = [{ ...content.experience[0], role: '首席開發員（來自 API）' }, ...content.experience.slice(1)]
    queueJson(content)
    renderAt('/zh-hant')
    expect(await screen.findByRole('heading', { level: 3, name: '首席開發員（來自 API）' })).toBeInTheDocument()
    expect(screen.getByText('加拿大安大略省')).toBeInTheDocument()
  })
})
