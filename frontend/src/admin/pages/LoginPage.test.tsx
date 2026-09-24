import { screen, waitFor } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { navigation } from '../../test/navigation'
import { ADMIN_EMAIL, summary } from '../test/fixtures'
import { deferred, failWith, mockApi, ok, sequence } from '../test/mockApi'
import { findPageHeading, renderAdmin } from '../test/renderAdmin'

const email = () => screen.getByLabelText('Email')
const password = () => screen.getByLabelText('Password')
const submit = () => screen.getByRole('button', { name: /Sign in|Signing in/ })
const loginStatus = () => screen.getByRole('status')

async function fillAndSubmit(user: UserEvent, secret = 'correct horse') {
  await user.clear(email())
  await user.type(email(), ADMIN_EMAIL)
  await user.clear(password())
  await user.type(password(), secret)
  await user.click(submit())
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

  it('signs in and opens the dashboard by default', async () => {
    const api = mockApi({ 'POST /auth/login': ok({ email: ADMIN_EMAIL }), 'GET /admin/summary': ok(summary()) })
    const { user } = renderAdmin('/admin/login')
    await findPageHeading('Sign in')
    expect(email()).toHaveAttribute('autocomplete', 'username')
    expect(password()).toHaveAttribute('autocomplete', 'current-password')

    await fillAndSubmit(user)
    expect(await findPageHeading('Dashboard')).toBeInTheDocument()
    await waitFor(() => expect(navigation.location?.pathname).toBe('/admin'))
    expect(api.to('POST /auth/login')[0].json).toEqual({ email: ADMIN_EMAIL, password: 'correct horse' })
    // No extra session check: the sign-in answered it.
    expect(api.to('GET /auth/me')).toEqual([])
  })

  it('shows one generic message for a wrong email or password and clears the password', async () => {
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
  })

  it('says when to try again after too many attempts', async () => {
    mockApi({
      'POST /auth/login': sequence(
        failWith(429, 'rate_limited', { headers: { 'Retry-After': '125' } }),
        failWith(429, 'rate_limited', { headers: { 'Retry-After': '30' } }),
        failWith(429, 'rate_limited'),
      ),
    })
    const { user } = renderAdmin('/admin/login')
    await findPageHeading('Sign in')

    await fillAndSubmit(user)
    await waitFor(() => expect(loginStatus()).toHaveTextContent('Too many attempts. Please try again in 3 minutes.'))
    await fillAndSubmit(user)
    await waitFor(() => expect(loginStatus()).toHaveTextContent('Too many attempts. Please try again in 1 minute.'))
    await fillAndSubmit(user)
    await waitFor(() => expect(loginStatus()).toHaveTextContent('Too many attempts. Please try again later.'))
  })

  it('reports a server it cannot reach, and keeps the button focusable while signing in', async () => {
    const pending = deferred()
    mockApi({ 'POST /auth/login': sequence(pending.handler, () => Promise.reject(new TypeError('offline'))) })
    const { user } = renderAdmin('/admin/login')
    await findPageHeading('Sign in')

    await fillAndSubmit(user)
    expect(submit()).toHaveAttribute('aria-disabled', 'true')
    expect(submit()).toHaveTextContent('Signing in…')
    pending.resolve(new Response('<html>Bad gateway</html>', { status: 502 }))
    await waitFor(() => expect(loginStatus()).toHaveTextContent('the server did not answer'))
    expect(submit()).not.toHaveAttribute('aria-disabled')

    await fillAndSubmit(user)
    await waitFor(() => expect(loginStatus()).toHaveTextContent('the server did not answer'))
  })

  it('is fully translated', async () => {
    mockApi({})
    await i18n.changeLanguage('zh-Hant')
    renderAdmin('/admin/login')
    expect(await findPageHeading('登入')).toBeInTheDocument()
    expect(screen.getByLabelText('電郵')).toBeInTheDocument()
    expect(screen.getByLabelText('密碼')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('zh-Hant')
  })
})
