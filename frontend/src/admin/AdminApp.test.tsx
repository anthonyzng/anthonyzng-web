import { act, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { jsonResponse } from '../test/api'
import { navigation } from '../test/navigation'
import { ADMIN_EMAIL, experience, signedIn, summary } from './test/fixtures'
import { deferred, failWith, mockApi, noContent, ok, sequence } from './test/mockApi'
import { findPageHeading, renderAdmin } from './test/renderAdmin'

const signIn = async (user: ReturnType<typeof renderAdmin>['user']) => {
  await user.type(screen.getByLabelText('Email'), ADMIN_EMAIL)
  await user.type(screen.getByLabelText('Password'), 'correct horse')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('admin panel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    localStorage.clear()
    document.documentElement.dataset.theme = 'light'
    document.documentElement.lang = 'en'
  })

  it('asks /auth/me once on entry, then moves between admin pages without asking again', async () => {
    const api = mockApi({ ...signedIn(), 'GET /admin/content/experience': ok({ items: experience() }) })
    const { user } = renderAdmin('/admin')

    expect(await findPageHeading('Dashboard')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Experience 2 entries' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Experience' }))
    expect(await findPageHeading('Experience')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Experience' })).toHaveAttribute('aria-current', 'page')

    expect(api.to('GET /auth/me')).toHaveLength(1)
    expect(api.to('GET /auth/me')[0].init?.credentials).toBe('include')
    expect(api.unrouted).toEqual([])
  })

  it('sends a visitor without a session to the login page, then back to the page they asked for', async () => {
    const api = mockApi({
      'GET /auth/me': failWith(401, 'unauthorized'),
      'POST /auth/login': ok({ email: ADMIN_EMAIL }),
      'GET /admin/summary': ok(summary()),
      'GET /admin/content/experience': ok({ items: experience() }),
    })
    const { user } = renderAdmin('/admin/content/experience')

    expect(await findPageHeading('Sign in')).toBeInTheDocument()
    await waitFor(() => expect(navigation.location?.pathname).toBe('/admin/login'))
    await signIn(user)

    expect(await findPageHeading('Experience')).toBeInTheDocument()
    await waitFor(() => expect(navigation.location?.pathname).toBe('/admin/content/experience'))
    const [login] = api.to('POST /auth/login')
    expect(login.json).toEqual({ email: ADMIN_EMAIL, password: 'correct horse' })
    expect(login.init?.credentials).toBe('include')
    // The sign-in proved the session: no second /auth/me.
    expect(api.to('GET /auth/me')).toHaveLength(1)
  })

  it('returns to the login page with a "session expired" notice on a 401, then back to where the user was', async () => {
    mockApi({
      ...signedIn(),
      'GET /admin/content/experience': sequence(failWith(401, 'unauthorized'), ok({ items: experience() })),
      'POST /auth/login': ok({ email: ADMIN_EMAIL }),
    })
    const { user } = renderAdmin('/admin/content/experience')

    const heading = await findPageHeading('Sign in')
    const notice = 'Your session has expired. Sign in again to continue where you left off.'
    expect(screen.getByText(notice)).toBeInTheDocument()
    // Read together with the heading, which takes focus after the redirect.
    expect(heading).toHaveAccessibleDescription(notice)
    await waitFor(() => expect(heading).toHaveFocus())

    await signIn(user)
    expect(await findPageHeading('Experience')).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Experience' })).toHaveTextContent('Lead Developer · Acme Corp')
  })

  it('reports a session check that could not reach the server, with a retry that keeps focus and is announced', async () => {
    const api = mockApi({ 'GET /admin/summary': ok(summary()) })
    const { user } = renderAdmin('/admin')
    const first = await screen.findByRole('alert')
    expect(first).toHaveTextContent(/Your session could not be checked/)

    // Failing again: focus stays on this screen (not <body>), and the failure is a new alert.
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('main')).toHaveFocus()
    await waitFor(() => expect(screen.getByRole('alert')).not.toBe(first))

    api.route({ 'GET /auth/me': ok({ email: ADMIN_EMAIL }) })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    const heading = await findPageHeading('Dashboard')
    // The panel replaced the screen: its heading takes focus.
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('never lets a summary answered after its layout left expire a later session', async () => {
    const stale = deferred()
    const api = mockApi({
      'GET /auth/me': ok({ email: ADMIN_EMAIL }),
      'GET /admin/summary': sequence(stale.handler, ok(summary())),
      'GET /admin/content/experience': sequence(failWith(401, 'unauthorized'), ok({ items: experience() })),
      'POST /auth/login': ok({ email: ADMIN_EMAIL }),
    })
    const { user } = renderAdmin('/admin/content/experience')
    // The list's 401 ends the session while the first summary is still on its way.
    expect(await findPageHeading('Sign in')).toBeInTheDocument()
    expect(api.to('GET /admin/summary')[0].init?.signal?.aborted).toBe(true)

    await signIn(user)
    expect(await screen.findByRole('list', { name: 'Experience' })).toBeInTheDocument()
    // The old request answers now, with a 401 from the session that ended: it changes nothing.
    stale.resolve(jsonResponse({ error: { code: 'unauthorized', message: 'expired (test)' } }, { status: 401 }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByRole('heading', { level: 1, name: 'Experience' })).toBeInTheDocument()
    expect(navigation.location?.pathname).toBe('/admin/content/experience')
  })

  it('keeps "signed out" when a summary from before the sign-out answers 401 afterwards', async () => {
    const stale = deferred()
    const api = mockApi({
      'GET /auth/me': ok({ email: ADMIN_EMAIL }),
      'GET /admin/summary': stale.handler,
      'POST /auth/logout': noContent,
    })
    const { user } = renderAdmin('/admin')
    await findPageHeading('Dashboard')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await findPageHeading('Sign in')).toBeInTheDocument()
    expect(api.to('GET /admin/summary')[0].init?.signal?.aborted).toBe(true)

    stale.resolve(jsonResponse({ error: { code: 'unauthorized', message: 'revoked (test)' } }, { status: 401 }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByText('You have signed out.')).toBeInTheDocument()
    expect(screen.queryByText(/Your session has expired/)).toBeNull()
  })

  it('keeps the panel out of search engines and in the right language while mounted', async () => {
    mockApi(signedIn())
    await i18n.changeLanguage('zh-Hant')
    document.title = 'Anthony Ng'
    const { unmount } = renderAdmin('/admin')

    expect(await findPageHeading('概覽')).toBeInTheDocument()
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    expect(document.documentElement.lang).toBe('zh-Hant')
    expect(document.title).toBe('概覽 · 管理介面 · anthonyzng')

    unmount()
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
    expect(document.title).toBe('Anthony Ng')
    expect(document.documentElement.lang).toBe('en')
  })

  it('switches language, stores the choice and gives focus to the new toggle button', async () => {
    mockApi(signedIn())
    const { user } = renderAdmin('/admin')
    await findPageHeading('Dashboard')

    await user.click(screen.getByRole('button', { name: 'Switch language to 繁體中文' }))
    expect(await findPageHeading('概覽')).toBeInTheDocument()
    expect(localStorage.getItem('lang')).toBe('zh-Hant')
    expect(document.documentElement.lang).toBe('zh-Hant')
    expect(screen.getByRole('button', { name: '切換語言至English' })).toHaveFocus()
    expect(screen.getByRole('link', { name: '工作經驗' })).toBeInTheDocument()
  })

  it('reuses the site theme toggle', async () => {
    mockApi(signedIn())
    const { user } = renderAdmin('/admin')
    await findPageHeading('Dashboard')
    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('shows the unread count on the Messages link', async () => {
    mockApi({ ...signedIn(), 'GET /admin/summary': ok(summary({ unreadMessages: 3 })) })
    renderAdmin('/admin')
    expect(await screen.findByRole('link', { name: 'Messages 3 unread' })).toBeInTheDocument()
  })

  it('opens and closes the navigation below md with a disclosure button', async () => {
    mockApi(signedIn())
    const { user } = renderAdmin('/admin')
    await findPageHeading('Dashboard')
    const menu = screen.getByRole('button', { name: 'Menu' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('navigation', { name: 'Admin' })).toHaveLength(1)

    await user.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    const navs = screen.getAllByRole('navigation', { name: 'Admin' })
    expect(navs).toHaveLength(2)
    expect(menu).toHaveAttribute('aria-controls', navs[0].id)

    // It closes by itself on the next page.
    await user.click(within(navs[0]).getByRole('link', { name: 'CV' }))
    await waitFor(() => expect(menu).toHaveAttribute('aria-expanded', 'false'))
  })

  it('signs out and lands on the login page with a confirmation', async () => {
    const api = mockApi({ ...signedIn(), 'POST /auth/logout': noContent })
    const { user } = renderAdmin('/admin')
    await findPageHeading('Dashboard')

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await findPageHeading('Sign in')).toBeInTheDocument()
    expect(screen.getByText('You have signed out.')).toBeInTheDocument()
    expect(api.to('POST /auth/logout')[0].init?.credentials).toBe('include')
  })

  it('shows a not-found page inside the panel for an unknown admin URL', async () => {
    mockApi(signedIn())
    renderAdmin('/admin/nothing-here')
    expect(await findPageHeading('Not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toHaveAttribute('href', '/admin')
  })

  it('links to the public site in the current language, in a new tab', async () => {
    mockApi(signedIn())
    renderAdmin('/admin')
    await findPageHeading('Dashboard')
    const site = screen.getByRole('link', { name: 'View site (opens in a new tab)' })
    expect(site).toHaveAttribute('href', '/en')
    expect(site).toHaveAttribute('target', '_blank')
    await act(async () => {
      await i18n.changeLanguage('zh-Hant')
    })
    expect(screen.getByRole('link', { name: '查看網站 （在新分頁開啟）' })).toHaveAttribute('href', '/zh-hant')
  })
})
