import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import i18n from './i18n'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
  })

  it('redirects "/" to the detected language', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Anthony Ng' })).toBeInTheDocument()
    expect(screen.getByText('Full Stack Software Developer')).toBeInTheDocument()
  })

  it('renders Traditional Chinese under /zh-hant', async () => {
    renderAt('/zh-hant')
    expect(await screen.findByText('全端軟件開發者')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('zh-Hant')
  })

  it('sets <html lang> even when i18n already matches the URL', async () => {
    await i18n.changeLanguage('zh-Hant')
    document.documentElement.lang = 'en'
    renderAt('/zh-hant')
    await screen.findByText('全端軟件開發者')
    expect(document.documentElement.lang).toBe('zh-Hant')
  })

  it('redirects an unknown language prefix to English', async () => {
    renderAt('/fr')
    expect(await screen.findByText('Full Stack Software Developer')).toBeInTheDocument()
  })

  it('shows the 404 page for unknown paths', async () => {
    renderAt('/en/does-not-exist')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('switches language via the switcher', async () => {
    renderAt('/en')
    await userEvent.click(await screen.findByRole('link', { name: 'Switch language to 繁體中文' }))
    expect(await screen.findByText('全端軟件開發者')).toBeInTheDocument()
  })

  it('toggles and persists the theme', async () => {
    renderAt('/en')
    await userEvent.click(await screen.findByRole('button', { name: 'Switch to dark mode' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument()
  })
})
