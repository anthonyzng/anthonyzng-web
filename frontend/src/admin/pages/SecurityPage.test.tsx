import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { signedIn, summary } from '../test/fixtures'
import { failWith, mockApi, ok, sequence } from '../test/mockApi'
import { findPageHeading, renderAdmin, statusRegion } from '../test/renderAdmin'

const OFF = { enabled: false, enabledAt: null }
const ON = { enabled: true, enabledAt: '2026-09-25T08:00:00Z' }
const SETUP = {
  secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  uri: 'otpauth://totp/owwsolution.com:admin@example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=owwsolution.com',
}

const password = () => screen.getByLabelText('Password')
const code = () => screen.getByLabelText('Authentication code')

describe('Security page', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
  })

  it('sets up two-factor sign-in with a QR code, the password and a code', async () => {
    const api = mockApi({
      ...signedIn(),
      'GET /admin/totp': ok(OFF),
      'POST /admin/totp/setup': ok(SETUP),
      'POST /admin/totp/enable': sequence(failWith(400, 'wrong_password'), failWith(400, 'totp_invalid'), ok(ON)),
    })
    const { user } = renderAdmin('/admin/security')
    await findPageHeading('Security')
    expect(await screen.findByText('Off: the password alone signs in.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Set up two-factor sign-in' }))
    const qr = await screen.findByRole('img', { name: 'QR code for your authenticator app' })
    expect(qr.querySelector('path')?.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/)
    // The key in groups of four, for typing by hand.
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    expect(password()).toHaveAccessibleDescription('Please enter your password.')
    expect(api.to('POST /admin/totp/enable')).toEqual([])

    await user.type(password(), 'wrong')
    await user.type(code(), '123 456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    await waitFor(() => expect(password()).toHaveAccessibleDescription('The password is not correct.'))
    expect(password()).toHaveValue('')
    expect(password()).toHaveFocus()

    await user.type(password(), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    await waitFor(() => expect(code()).toHaveAccessibleDescription(expect.stringContaining('That code is not right.')))
    expect(code()).toHaveValue('')

    await user.type(code(), '654321')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    await waitFor(() => expect(statusRegion()).toHaveTextContent('Two-factor sign-in is on. Other devices have been signed out.'))
    expect(screen.getByRole('heading', { level: 2, name: 'Two-factor sign-in' })).toHaveFocus()
    expect(screen.getByText(/On since/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'QR code for your authenticator app' })).toBeNull()
    expect(api.to('POST /admin/totp/enable').map((call) => call.json)).toEqual([
      { password: 'wrong', code: '123456' },
      { password: 'correct horse', code: '123456' },
      { password: 'correct horse', code: '654321' },
    ])
    // The dashboard's reminder follows: the summary is asked again.
    await waitFor(() => expect(api.to('GET /admin/summary').length).toBeGreaterThan(1))
  })

  it('turns it off with the password and a current code', async () => {
    const api = mockApi({
      ...signedIn(),
      'GET /admin/totp': ok(ON),
      'POST /admin/totp/disable': ok(OFF),
    })
    const { user } = renderAdmin('/admin/security')
    await findPageHeading('Security')
    expect(await screen.findByRole('heading', { level: 3, name: 'Turn off two-factor sign-in' })).toBeInTheDocument()

    await user.type(password(), 'correct horse')
    await user.type(code(), '111111')
    await user.click(screen.getByRole('button', { name: 'Turn off' }))
    await waitFor(() => expect(statusRegion()).toHaveTextContent('Two-factor sign-in is off. Other devices have been signed out.'))
    expect(screen.getByText('Off: the password alone signs in.')).toBeInTheDocument()
    expect(api.to('POST /admin/totp/disable')[0].json).toEqual({ password: 'correct horse', code: '111111' })
  })

  it('shows the current setting when another tab changed it', async () => {
    mockApi({
      ...signedIn(),
      'GET /admin/totp': sequence(ok(OFF), ok(ON)),
      'POST /admin/totp/setup': failWith(409, 'conflict'),
    })
    const { user } = renderAdmin('/admin/security')
    await findPageHeading('Security')
    await user.click(await screen.findByRole('button', { name: 'Set up two-factor sign-in' }))
    await waitFor(() =>
      expect(statusRegion()).toHaveTextContent('Two-factor sign-in was changed in another tab. The current setting is shown.'),
    )
    expect(await screen.findByText(/On since/)).toBeInTheDocument()
  })

  it('says when the setup could not start', async () => {
    mockApi({
      ...signedIn(),
      'GET /admin/totp': ok(OFF),
      'POST /admin/totp/setup': failWith(500, 'internal_error'),
    })
    const { user } = renderAdmin('/admin/security')
    await findPageHeading('Security')
    await user.click(await screen.findByRole('button', { name: 'Set up two-factor sign-in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The setup could not be started.')
  })

  it('is reachable from the navigation, and the dashboard reminds while it is off', async () => {
    mockApi({ ...signedIn(), 'GET /admin/summary': ok(summary({ totpEnabled: false })), 'GET /admin/totp': ok(OFF) })
    const { user } = renderAdmin('/admin')
    await findPageHeading('Dashboard')
    expect(await screen.findByRole('heading', { name: 'Two-factor sign-in is off' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Set up two-factor sign-in' }))
    await findPageHeading('Security')
    expect(screen.getByRole('link', { name: 'Security', current: 'page' })).toBeInTheDocument()
  })

  it('shows no reminder once it is on', async () => {
    mockApi({ ...signedIn(), 'GET /admin/summary': ok(summary({ totpEnabled: true })) })
    renderAdmin('/admin')
    await findPageHeading('Dashboard')
    await screen.findByText('Messages and files')
    expect(screen.queryByRole('heading', { name: 'Two-factor sign-in is off' })).toBeNull()
  })
})
