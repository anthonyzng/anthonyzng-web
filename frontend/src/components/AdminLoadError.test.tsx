import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import i18n from '../i18n'
import { ADMIN_RELOAD_FLAG } from './AdminLoadError'

// The admin chunk cannot be fetched (a broken deploy, or offline twice in a row).
vi.mock('../admin/AdminApp', () => {
  throw new Error('chunk failed to load')
})

describe('admin chunk failure', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    // The automatic reload already happened once in this tab.
    sessionStorage.setItem(ADMIN_RELOAD_FLAG, '1')
    // React reports the caught render error; jsdom cannot navigate on reload().
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('shows a message with a reload button instead of a blank page', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'The admin panel could not be loaded' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    // The next failure may reload automatically once again.
    expect(sessionStorage.getItem(ADMIN_RELOAD_FLAG)).toBeNull()
  })
})
