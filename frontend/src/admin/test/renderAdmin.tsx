import { configure, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach } from 'vitest'
import { App } from '../../App'
import { NavigationHandle } from '../../test/NavigationHandle'

// Admin pages render after a guard check and one or two fetches: give findBy/waitFor room on a busy
// CI box (this module is imported only by admin tests, and each test file has its own module copy).
configure({ asyncUtilTimeout: 5_000 })

// The editor keeps unsaved drafts in sessionStorage (draftStore.ts); the shared setup only clears
// localStorage, so a draft left by one test must not be restored in the next.
afterEach(() => sessionStorage.clear())

/**
 * Renders the whole app at an admin URL, so the lazy /admin route, the guard and the layout are all
 * real. Pair it with `mockApi` (the fake backend). `applyAccept: false` lets a test pick a file the
 * input's `accept` would hide, to exercise the client-side type check.
 */
export function renderAdmin(path: string) {
  const user = userEvent.setup({ applyAccept: false })
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <NavigationHandle />
    </MemoryRouter>,
  )
  return { user, ...view }
}

/**
 * The h1 of the current admin page, once it is on screen. The first render of a test file also
 * waits for the lazy admin chunk to be transformed and imported, which can take a few seconds.
 */
export const findPageHeading = (name: string | RegExp) =>
  screen.findByRole('heading', { level: 1, name }, { timeout: 10_000 })

/** The admin panel's polite live region (the layout's; the login page has its own). */
export function statusRegion(): HTMLElement {
  const region = document.querySelector<HTMLElement>('#admin-main [role="status"]')
  if (!region) throw new Error('The admin layout is not rendered.')
  return region
}
