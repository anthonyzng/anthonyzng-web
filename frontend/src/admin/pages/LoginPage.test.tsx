import { act, screen, waitFor } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { navigation } from '../../test/navigation'
import { turnstileFake } from '../../test/turnstileFake'
import { ADMIN_EMAIL, summary } from '../test/fixtures'
import { deferred, failWith, mockApi, ok, sequence } from '../test/mockApi'
import { findPageHeading, renderAdmin } from '../test/renderAdmin'

const email = () => screen.getByLabelText('Email')
const password = () => screen.getByLabelText('Password')
const submit = () => screen.getByRole('button', { name: /Sign in|Signing in/ })
const loginStatus = () => screen.getByRole('status')
const widget = () => screen.getByTestId('turnstile')

const CHECK_REQUIRED = 'Please complete the verification check.'

async function fillAndSubmit(user: UserEvent, secret = 'correct horse') {
  await user.clear(email())
  await user.type(email(), ADMIN_EMAIL)
  await user.clear(password())
  await user.type(password(), secret)
  await user.click(submit())
}

/** The widget solves its challenge late: it re-renders for a new theme and issues a token then. */
async function solveLate(token = turnstileFake.token) {
  turnstileFake.autoSolve = true
  turnstileFake.token = token
  await act(async () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('LoginPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
  })

  it('validates inline and never posts an incomplete form', async () => {
    const api = mockApi({})
    const { user } = renderAdmin('/admin/login')
    await findPageHeading('Sign in')

    await user.click(submit())
    expect(screen.getByText('Please enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Please enter your password.')).toBeInTheDocument()
    expect(email()).toHaveAttribute('aria-invalid', 'true')
    expect(email()).toHaveAccessibleDescription('Please enter your email address.')
    expect(email()).toHaveFocus()
    expect(loginStatus()).toHaveTextContent('Please check the highlighted fields.')

    await user.type(email(), 'not-an-email')
    expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument()
    expect(api.calls).toEqual([])
  })

  it('renders the verification widget with the site key, the page theme and language', async () => {
    mockApi({})
    renderAdmin('/admin/login')
    await findPageHeading('Sign in')
    expect(widget()).toHaveAttribute('data-sitekey', '1x00000000000000000000AA')
    expect(widget()).toHaveAttribute('data-theme', 'light')
    expect(widget()).toHaveAttribute('data-language', 'en')

    document.documentElement.dataset.theme = 'dark'
    await waitFor(() => expect(widget()).toHaveAttribute('data-theme', 'dark'))
  })

  it('signs in with the token and opens the dashboard by default', async () => {
    const api = mockApi({ 'POST /auth/login': ok({ email: ADMIN_EMAIL }), 'GET /admin/summary': ok(summary()) })
    const { user } = renderAdmin('/admin/login')
    await findPageHeading('Sign in')
    expect(email()).toHaveAttribute('autocomplete', 'username')
    expect(password()).toHaveAttribute('autocomplete', 'current-password')

    await fillAndSubmit(user)
    expect(await findPageHeading('Dashboard')).toBeInTheDocument()
    await waitFor(() => expect(navigation.location?.pathname).toBe('/admin'))
    expect(api.to('POST /auth/login')[0].json).toEqual({
      email: ADMIN_EMAIL,
      password: 'correct horse',
      turnstileToken: 'test-token',
    })
    // No extra session check: the sign-in answered it.
    expect(api.to('GET /auth/me')).toEqual([])
    expect(turnstileFake.reset).not.toHaveBeenCalled()
  })

  it('holds the sign-in until the verification check has issued a token', async () => {
    turnstileFake.autoSolve = false
    const api = mockApi({ 'POST /auth/login': ok({ email: ADMIN_EMAIL }), 'GET /admin/summary': ok(summary()) })
    const { user } = renderAdmin('/admin/login')
    await findPageHeading('Sign in')

    await fillAndSubmit(user)
    expect(screen.getByText(CHECK_REQUIRED)).toBeInTheDocument()
    // The widget is an iframe: the button carries the message, and the status line announces it.
    expect(submit()).toHaveAccessibleDescription(CHECK_REQUIRED)
    expect(submit()).toHaveFocus()
    expect(loginStatus()).toHaveTextContent('Complete the verification check above, then sign in.')
    // Neither field is blamed for the missing check.
    expect(email()).not.toHaveAttribute('aria-invalid')
    expect(password()).not.toHaveAttribute('aria-invalid')
    expect(api.calls).toEqual([])

    await solveLate('late-token')
    await waitFor(() => expect(screen.queryByText(CHECK_REQUIRED)).toBeNull())
    expect(loginStatus()).toHaveTextContent('')
    expect(submit()).not.toHaveAccessibleDescription()

    await user.click(submit())
    expect(await findPageHeading('Dashboard')).toBeInTheDocument()
    expect(api.to('POST /auth/login')[0].json).toMatchObject({ turnstileToken: 'late-token' })
  })

  it('shows one generic message for a wrong email or password, clears the password and resets the widget', async () => {
    mockApi({ 'POST /auth/login': failWith(401, 'invalid_credentials') })
    const { user } = renderAdmin('/admin/login')
    await findPageHeading('Sign in')

    await fillAndSubmit(user, 'wrong')
    await waitFor(() => expect(loginStatus()).toHaveTextContent('Wrong email or password.'))
    expect(password()).toHaveValue('')
    expect(email()).toHaveValue(ADMIN_EMAIL)
    // Neither field is blamed: the backend does not say which one was wrong.
    expect(email()).not.toHaveAttribute('aria-invalid')
    expect(password()).not.toHaveAttribute('aria-invalid')
    // The token was spent on that attempt.
    expect(turnstileFake.reset).toHaveBeenCalledTimes(1)
  })

  it('never sends a spent token again', async () => {
    const pending = deferred()
    const api = mockApi({ 'POST /auth/login': pending.handler })
    const { user } = renderAdmin('/admin/login')
    await findPageHeading('Sign in')

    await fillAndSubmit(user, 'wrong')
    // The widget has not solved its new challenge yet when the answer lands.
    turnstileFake.autoSolve = false
    pending.resolve(new Response(JSON.stringify({ error: { code: 'invalid_credentials', message: 'x' } }), { status: 401 }))
    await waitFor(() => expect(loginStatus()).toHaveTextContent('Wrong email or password.'))
    expect(turnstileFake.reset).toHaveBeenCalledTimes(1)

    await fillAndSubmit(user)
    expect(screen.getByText(CHECK_REQUIRED)).toBeInTheDocument()
    expect(api.to('POST /auth/login')).toHaveLength(1)
  })

  it('says when to try again after too many attempts, and resets the widget each time', async () => {
    const api = mockApi({
      'POST /auth/login': sequence(
        failWith(429, 'rate_limited', { headers: { 'Retry-After': '125' } }),
        failWith(429, 'rate_limited', { headers: { 'Retry-After': '60' } }),
        failWith(429, 'rate_limited', { headers: { 'Retry-After': '3' } }),
        failWith(429, 'rate_limited', { headers: { 'Retry-After': '1' } }),
        failWith(429, 'rate_limited'),
      ),
    })
    const { user } = renderAdmin('/admin/login')
    await findPageHeading('Sign in')

    await fillAndSubmit(user)
    await waitFor(() => expect(loginStatus()).toHaveTextContent('Too many attempts. Please try again in 3 minutes.'))
    await fillAndSubmit(user)
    await waitFor(() => expect(loginStatus()).toHaveTextContent('Too many attempts. Please try again in 1 minute.'))
    // Too many password checks at once: a wait of seconds, said in seconds.
    await fillAndSubmit(user)
    await waitFor(() => expect(loginStatus()).toHaveTextContent('Too many attempts. Please try again in 3 seconds.'))
    await fillAndSubmit(user)
    await waitFor(() => expect(loginStatus()).toHaveTextContent('Too many attempts. Please try again in 1 second.'))
    await fillAndSubmit(user)
    await waitFor(() => expect(loginStatus()).toHaveTextContent('Too many attempts. Please try again later.'))
    expect(turnstileFake.reset).toHaveBeenCalledTimes(5)
    expect(api.to('POST /auth/login')).toHaveLength(5)
  })

  it('asks for the check again when the server rejects it, and sends the new token', async () => {
    const pending = deferred()
    const api = mockApi({
      'POST /auth/login': sequence(pending.handler, ok({ email: ADMIN_EMAIL })),
      'GET /admin/summary': ok(summary()),
    })
    const { user } = renderAdmin('/admin/login')
    await findPageHeading('Sign in')

    await fillAndSubmit(user)
    turnstileFake.token = 'fresh-token' // what the widget issues after its reset
    pending.resolve(new Response(JSON.stringify({ error: { code: 'turnstile_failed', message: 'x' } }), { status: 400 }))
    await waitFor(() =>
      expect(loginStatus()).toHaveTextContent('The verification check failed. Please complete it again, then sign in.'),
    )
    expect(turnstileFake.reset).toHaveBeenCalledTimes(1)
    expect(password()).toHaveValue('correct horse')
    expect(submit()).not.toHaveAttribute('aria-disabled')

    await user.click(submit())
    expect(await findPageHeading('Dashboard')).toBeInTheDocument()
    const [first, second] = api.to('POST /auth/login')
    expect(first.json).toMatchObject({ turnstileToken: 'test-token' })
    expect(second.json).toMatchObject({ turnstileToken: 'fresh-token' })
  })

  it('asks to try again shortly when the verification service is unreachable', async () => {
    mockApi({ 'POST /auth/login': failWith(503, 'service_unavailable') })
    const { user } = renderAdmin('/admin/login')
    await findPageHeading('Sign in')

    await fillAndSubmit(user)
    await waitFor(() =>
      expect(loginStatus()).toHaveTextContent('The verification service is not responding. Please try again shortly.'),
    )
    expect(turnstileFake.reset).toHaveBeenCalledTimes(1)
    expect(password()).toHaveValue('correct horse')
  })

  it('maps a 422 onto the fields, and resets the widget only when the token was refused', async () => {
    mockApi({
      'POST /auth/login': sequence(
        failWith(422, 'validation_error', { fields: { email: 'value is not a valid email address' } }),
        failWith(422, 'validation_error', { fields: { turnstileToken: 'String should have at most 2048 characters' } }),
      ),
    })
    const { user } = renderAdmin('/admin/login')
    await findPageHeading('Sign in')

    await fillAndSubmit(user)
    await waitFor(() => expect(email()).toHaveAttribute('aria-invalid', 'true'))
    expect(email()).toHaveFocus()
    // Validation comes first on the server: the token was never checked, so the widget keeps it.
    expect(turnstileFake.reset).not.toHaveBeenCalled()

    await fillAndSubmit(user)
    await waitFor(() => expect(turnstileFake.reset).toHaveBeenCalledTimes(1))
    // The widget answered its reset with a new token, which withdraws the message at once.
    expect(screen.queryByText(CHECK_REQUIRED)).toBeNull()
  })

  it('reports a server it cannot reach, and keeps the button focusable while signing in', async () => {
    const pending = deferred()
    mockApi({ 'POST /auth/login': sequence(pending.handler, () => Promise.reject(new TypeError('offline'))) })
    const { user } = renderAdmin('/admin/login')
    await findPageHeading('Sign in')

    await fillAndSubmit(user)
    expect(submit()).toHaveAttribute('aria-disabled', 'true')
    expect(submit()).not.toHaveAttribute('disabled')
    expect(submit()).toHaveTextContent('Signing in…')
    pending.resolve(new Response('<html>Bad gateway</html>', { status: 502 }))
    await waitFor(() => expect(loginStatus()).toHaveTextContent('the server did not answer'))
    expect(submit()).not.toHaveAttribute('aria-disabled')

    await fillAndSubmit(user)
    await waitFor(() => expect(loginStatus()).toHaveTextContent('the server did not answer'))
    expect(turnstileFake.reset).toHaveBeenCalledTimes(2)
  })

  it('is fully translated', async () => {
    turnstileFake.autoSolve = false
    mockApi({})
    await i18n.changeLanguage('zh-Hant')
    const { user } = renderAdmin('/admin/login')
    expect(await findPageHeading('登入')).toBeInTheDocument()
    expect(screen.getByLabelText('電郵')).toBeInTheDocument()
    expect(screen.getByLabelText('密碼')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('zh-Hant')
    // Cloudflare's language codes are lowercase.
    expect(widget()).toHaveAttribute('data-language', 'zh-tw')

    await user.type(screen.getByLabelText('電郵'), ADMIN_EMAIL)
    await user.type(screen.getByLabelText('密碼'), 'correct horse')
    await user.click(screen.getByRole('button', { name: '登入' }))
    expect(screen.getByText('請先完成驗證。')).toBeInTheDocument()
  })
})
