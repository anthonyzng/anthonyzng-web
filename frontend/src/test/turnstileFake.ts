import { vi } from 'vitest'

/**
 * Controls for the Turnstile stand-in (`FakeTurnstile`), which replaces `@marsidev/react-turnstile`
 * in every test (see setup.ts). Like Cloudflare's always-pass test key it issues a token as soon as
 * the widget renders and again after every reset or re-render for a new theme or language;
 * `autoSolve = false` keeps it silent, so a form can be submitted without a token.
 */
export const turnstileFake = {
  autoSolve: true,
  token: 'test-token',
  reset: vi.fn(),
  restore(): void {
    this.autoSolve = true
    this.token = 'test-token'
    this.reset.mockClear()
  },
}
