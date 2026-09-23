import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { installMatchMedia, resetMatchMedia } from './matchMedia'
import { installObservers, MockIntersectionObserver } from './observers'
import { turnstileFake } from './turnstileFake'

// Cloudflare's widget script never loads in jsdom: every test gets the stand-in (FakeTurnstile.tsx).
vi.mock('@marsidev/react-turnstile', async () => ({ Turnstile: (await import('./FakeTurnstile')).FakeTurnstile }))

// No network in tests: fetch fails like an unreachable backend unless a test queues a response
// (test/api.ts), so every page renders from the static content by default.
vi.stubGlobal(
  'fetch',
  vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch is disabled in tests'))),
)

// jsdom has no matchMedia: a controllable mock that matches nothing by default
// (light OS theme, no motion), so every test exercises the static page unless it opts in.
installMatchMedia()
installObservers()

// jsdom lacks scrollIntoView and only logs "not implemented" for window.scrollTo.
Element.prototype.scrollIntoView = vi.fn()
window.scrollTo = vi.fn() as typeof window.scrollTo

// jsdom 29 has HTMLDialogElement without showModal()/close(). Its default stylesheet already hides
// dialog:not([open]), so links in a closed menu are excluded from *ByRole queries.
const escapeHandlers = new WeakMap<HTMLDialogElement, (event: KeyboardEvent) => void>()

HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.dispatchEvent(new Event('cancel', { cancelable: true }))) this.close()
  }
  escapeHandlers.set(this, onKey)
  document.addEventListener('keydown', onKey)
}

HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return
  this.removeAttribute('open')
  const onKey = escapeHandlers.get(this)
  if (onKey) document.removeEventListener('keydown', onKey)
  escapeHandlers.delete(this)
  queueMicrotask(() => this.dispatchEvent(new Event('close'))) // async, like the real event
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  resetMatchMedia()
  MockIntersectionObserver.reset()
  // mockReset, not mockClear: a response a test queued but never consumed must not leak into the next one.
  vi.mocked(fetch).mockReset()
  turnstileFake.restore()
  vi.clearAllMocks()
})
