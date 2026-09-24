import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { ADMIN_EMAIL, summary } from '../test/fixtures'
import { failWith, mockApi, ok, sequence } from '../test/mockApi'
import { findPageHeading, renderAdmin, statusRegion } from '../test/renderAdmin'

describe('dashboard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
  })

  it('shows the counts, the inbox, the CV and how to refresh the static fallback', async () => {
    const api = mockApi({ 'GET /auth/me': ok({ email: ADMIN_EMAIL }), 'GET /admin/summary': ok(summary()) })
    renderAdmin('/admin')
    await findPageHeading('Dashboard')

    expect(await screen.findByRole('link', { name: 'Skill groups 1 entry' })).toHaveAttribute('href', '/admin/content/skill-groups')
    expect(screen.getByRole('link', { name: 'Languages 3 entries' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Messages 2 unread messages' })).toHaveAttribute('href', '/admin/messages?status=unread')
    expect(screen.getByRole('link', { name: 'CV resume.pdf (240 KB)' })).toHaveAttribute('href', '/admin/cv')
    expect(screen.getByText('npm run content:sync')).toBeInTheDocument()
    expect(screen.getByText(`Signed in as ${ADMIN_EMAIL}`)).toBeInTheDocument()
    // The layout's first summary and the dashboard's own share one request.
    expect(api.to('GET /admin/summary')).toHaveLength(1)
  })

  it('says when there is no CV and no unread message', async () => {
    mockApi({ 'GET /auth/me': ok({ email: ADMIN_EMAIL }), 'GET /admin/summary': ok(summary({ cv: null, unreadMessages: 0 })) })
    renderAdmin('/admin')
    expect(await screen.findByRole('link', { name: 'CV No CV uploaded' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Messages No unread messages' })).toHaveAttribute('href', '/admin/messages')
  })

  it('offers a retry when the summary cannot be loaded: each failure is announced, and so is the success', async () => {
    mockApi({
      'GET /auth/me': ok({ email: ADMIN_EMAIL }),
      'GET /admin/summary': sequence(failWith(500, 'internal_error'), failWith(503, 'service_unavailable'), ok(summary())),
    })
    const { user } = renderAdmin('/admin')
    const first = await screen.findByRole('alert')
    expect(first).toHaveTextContent('This could not be loaded.')
    const heading = screen.getByRole('heading', { level: 1, name: 'Dashboard' })

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(heading).toHaveFocus()
    await waitFor(() => expect(screen.getByRole('alert')).not.toBe(first))
    expect(statusRegion()).not.toHaveTextContent('Loaded.')

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(heading).toHaveFocus()
    expect(await screen.findByRole('link', { name: 'Experience 2 entries' })).toBeInTheDocument()
    expect(statusRegion()).toHaveTextContent('Loaded.')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
