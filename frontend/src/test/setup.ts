import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { installMatchMedia, resetMatchMedia } from './matchMedia'
import { installObservers, MockIntersectionObserver } from './observers'

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
  vi.clearAllMocks()
})
