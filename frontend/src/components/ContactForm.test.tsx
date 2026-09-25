import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { fetchCalls, jsonResponse, queueDeferred, queueJson, requestBody } from '../test/api'
import { turnstileFake } from '../test/turnstileFake'
import { ContactForm } from './ContactForm'

const fields = () => ({
  name: screen.getByLabelText('Name'),
  email: screen.getByLabelText('Email address'),
  message: screen.getByLabelText('Message'),
})
const submitButton = () => screen.getByRole('button', { name: 'Send message' })
const status = () => screen.getByRole('status')
const honeypot = () => document.querySelector<HTMLInputElement>('input[name="website"]')!

const VALID = { name: 'Jane Doe', email: 'jane@example.com', message: 'Hello there, this is a test.' }

async function fill(user: UserEvent, values = VALID) {
  const { name, email, message } = fields()
  await user.type(name, values.name)
  await user.type(email, values.email)
  await user.type(message, values.message)
}

const GENERIC = 'Something went wrong and your message was not sent. Please try again, or use the channels above.'

describe('ContactForm', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
  })

  it('renders labelled required fields, the widget and a honeypot outside the accessibility tree', () => {
    render(<ContactForm />)
    expect(screen.getByRole('form', { name: 'Send a message' })).toBeInTheDocument()
    for (const control of Object.values(fields())) expect(control).toHaveAttribute('aria-required', 'true')
    expect(screen.getAllByRole('textbox')).toHaveLength(3)

    const widget = screen.getByTestId('turnstile')
    expect(widget).toHaveAttribute('data-sitekey', '1x00000000000000000000AA')
    expect(widget).toHaveAttribute('data-theme', 'light')
    expect(widget).toHaveAttribute('data-language', 'en')

    expect(honeypot()).toHaveAttribute('tabindex', '-1')
    expect(honeypot()).toHaveAttribute('autocomplete', 'off')
    expect(honeypot().closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Leave this field empty' })).toBeNull()
    expect(submitButton()).toBeEnabled()
    expect(status()).toHaveTextContent('')
  })

  it('gives the widget the page theme and language', async () => {
    render(<ContactForm />)
    document.documentElement.dataset.theme = 'dark'
    await waitFor(() => expect(screen.getByTestId('turnstile')).toHaveAttribute('data-theme', 'dark'))

    await act(async () => {
      await i18n.changeLanguage('zh-Hant')
    })
    expect(screen.getByTestId('turnstile')).toHaveAttribute('data-language', 'zh-tw')
    expect(screen.getByRole('form', { name: '發送訊息' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '傳送訊息' })).toBeInTheDocument()
  })

  it('validates inline, focuses the first fault and never submits an invalid form', async () => {
    const user = userEvent.setup()
    render(<ContactForm />)
    await user.click(submitButton())

    expect(screen.getByText('Please enter your name.')).toBeInTheDocument()
    expect(screen.getByText('Please enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Please enter a message.')).toBeInTheDocument()
    expect(fields().name).toHaveFocus()
    expect(fields().name).toHaveAttribute('aria-invalid', 'true')
    expect(fields().name).toHaveAccessibleDescription('Please enter your name.')
    expect(status()).toHaveTextContent('Please check the highlighted fields.')
    expect(fetch).not.toHaveBeenCalled()

    // A field marked invalid clears its message as soon as it is corrected.
    await user.type(fields().name, 'Jane')
    expect(screen.queryByText('Please enter your name.')).toBeNull()
    expect(fields().name).not.toHaveAttribute('aria-invalid')

    await user.type(fields().email, 'not-an-email')
    await user.tab()
    expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument()
    await user.type(fields().message, 'short')
    await user.tab()
    expect(screen.getByText('Your message must be at least 10 characters.')).toBeInTheDocument()
  })

  it('leaves an untouched field alone on blur until a submit has been attempted', async () => {
    const user = userEvent.setup()
    render(<ContactForm />)
    await user.click(fields().name)
    await user.tab()
    expect(screen.queryByText('Please enter your name.')).toBeNull()
  })

  it('requires the verification before sending', async () => {
    turnstileFake.autoSolve = false
    const user = userEvent.setup()
    render(<ContactForm />)
    await fill(user)
    await user.click(submitButton())
    expect(screen.getByText('Please complete the verification.')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('withdraws the verification error, and the status line, once the widget solves', async () => {
    turnstileFake.autoSolve = false
    const user = userEvent.setup()
    render(<ContactForm />)
    await fill(user)
    await user.click(submitButton())
    expect(status()).toHaveTextContent('Please check the highlighted fields.')

    // The widget solves late (a slow challenge, or a submit right after "Send another message").
    turnstileFake.autoSolve = true
    await act(async () => {
      document.documentElement.dataset.theme = 'dark' // the widget re-renders and issues its token
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(screen.queryByText('Please complete the verification.')).toBeNull())
    expect(status()).toHaveTextContent('')
  })

  it('clears "check the highlighted fields" as soon as every field is corrected', async () => {
    const user = userEvent.setup()
    render(<ContactForm />)
    await user.click(submitButton())
    expect(status()).toHaveTextContent('Please check the highlighted fields.')
    await fill(user)
    expect(screen.queryAllByText(/^Please enter/)).toHaveLength(0)
    expect(status()).toHaveTextContent('')
  })

  it('uses the singular for a one-minute wait', async () => {
    const user = userEvent.setup()
    queueJson({ error: { code: 'rate_limited', message: 'Slow down.' } }, { status: 429, headers: { 'Retry-After': '45' } })
    render(<ContactForm />)
    await fill(user)
    await user.click(submitButton())
    await waitFor(() => expect(status()).toHaveTextContent('Too many attempts. Please try again in 1 minute.'))
  })

  it('sends the message, holds the button while pending and replaces the form on success', async () => {
    const user = userEvent.setup()
    const pending = queueDeferred()
    render(<ContactForm />)
    await fill(user)
    await user.click(submitButton())

    // Held with aria-disabled, not disabled: the button keeps keyboard focus while the request runs.
    const sending = screen.getByRole('button', { name: 'Sending…' })
    expect(sending).toHaveAttribute('aria-disabled', 'true')
    expect(sending).not.toHaveAttribute('disabled')
    expect(sending).toHaveFocus()
    // A second submit while one is pending sends nothing.
    await user.click(sending)
    expect(fetchCalls()).toHaveLength(1)
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true')
    expect(status()).toHaveTextContent('Sending…')
    const [request] = fetchCalls()
    expect(request.url).toBe('http://localhost:8000/api/v1/contact')
    expect(request.init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(requestBody(request)).toEqual({ ...VALID, turnstileToken: 'test-token', website: '' })

    pending.resolve(jsonResponse({ status: 'accepted' }, { status: 202 }))
    const heading = await screen.findByRole('heading', { level: 3, name: 'Message sent' })
    expect(heading).toHaveFocus()
    expect(screen.queryByRole('form')).toBeNull()
    expect(status()).toHaveTextContent('Thanks for reaching out. I will get back to you soon.')

    await user.click(screen.getByRole('button', { name: 'Send another message' }))
    expect(screen.getByRole('form', { name: 'Send a message' })).toBeInTheDocument()
    expect(fields().name).toHaveValue('')
    expect(fields().message).toHaveValue('')
    expect(status()).toHaveTextContent('')
    // The button that had focus is gone: focus lands on the first field, never on <body>.
    expect(fields().name).toHaveFocus()
  })

  it('sends whatever a bot wrote into the honeypot', async () => {
    const user = userEvent.setup()
    queueJson({ status: 'accepted' }, { status: 202 })
    render(<ContactForm />)
    await fill(user)
    honeypot().value = 'https://spam.example'
    await user.click(submitButton())
    await screen.findByRole('heading', { level: 3, name: 'Message sent' })
    expect(requestBody(fetchCalls()[0])).toMatchObject({ website: 'https://spam.example' })
  })

  it('marks the fields the server rejects and keeps the widget', async () => {
    const user = userEvent.setup()
    queueJson(
      {
        error: {
          code: 'validation_error',
          message: 'Invalid request.',
          fields: { email: 'value is not a valid email address', turnstileToken: 'field required' },
        },
      },
      { status: 422 },
    )
    render(<ContactForm />)
    await fill(user)
    await user.click(submitButton())

    expect(await screen.findByText('Please check this field.')).toBeInTheDocument()
    expect(fields().email).toHaveAttribute('aria-invalid', 'true')
    expect(fields().email).toHaveFocus()
    expect(fields().name).not.toHaveAttribute('aria-invalid')
    expect(screen.getByText('Please complete the verification.')).toBeInTheDocument()
    expect(status()).toHaveTextContent('Please check the highlighted fields.')
    expect(turnstileFake.reset).not.toHaveBeenCalled()
    expect(submitButton()).not.toHaveAttribute('aria-disabled')
  })

  it('reports a server rejection that names no visible field instead of swallowing it', async () => {
    const user = userEvent.setup()
    queueJson(
      { error: { code: 'validation_error', message: 'Invalid request.', fields: { website: 'too long' } } },
      { status: 422 },
    )
    render(<ContactForm />)
    await fill(user)
    await user.click(submitButton())

    await waitFor(() => expect(status()).toHaveTextContent(GENERIC))
    for (const control of Object.values(fields())) expect(control).not.toHaveAttribute('aria-invalid')
    // The server never checked the token (validation comes first), so the widget keeps it.
    expect(turnstileFake.reset).not.toHaveBeenCalled()
    expect(fields().message).toHaveValue(VALID.message)
    expect(submitButton()).toHaveFocus()
  })

  it('tells the visitor when they are rate limited, using Retry-After', async () => {
    const user = userEvent.setup()
    queueJson(
      { error: { code: 'rate_limited', message: 'Too many requests. Try again later.' } },
      { status: 429, headers: { 'Retry-After': '540' } },
    )
    render(<ContactForm />)
    await fill(user)
    await user.click(submitButton())
    await waitFor(() => expect(status()).toHaveTextContent('Too many attempts. Please try again in 9 minutes.'))
    expect(submitButton()).not.toHaveAttribute('aria-disabled')
    expect(submitButton()).toHaveFocus()
    expect(turnstileFake.reset).not.toHaveBeenCalled()
  })

  it('recovers from a rejected verification with a generic error, a fresh widget and the draft kept', async () => {
    const user = userEvent.setup()
    queueJson({ error: { code: 'turnstile_failed', message: 'Verification failed. Please try again.' } }, { status: 400 })
    render(<ContactForm />)
    await fill(user)
    await user.click(submitButton())
    await waitFor(() => expect(status()).toHaveTextContent(GENERIC))
    expect(turnstileFake.reset).toHaveBeenCalledTimes(1)
    expect(fields().name).toHaveValue('Jane Doe')
    expect(fields().message).toHaveValue(VALID.message)
    expect(submitButton()).not.toHaveAttribute('aria-disabled')
    // Focus stayed on the button through the failed request, so the visitor can simply try again.
    expect(submitButton()).toHaveFocus()
  })

  it('treats a network failure like a server error', async () => {
    const user = userEvent.setup()
    render(<ContactForm />)
    await fill(user)
    await user.click(submitButton()) // the default fetch stub rejects
    await waitFor(() => expect(status()).toHaveTextContent(GENERIC))
    expect(turnstileFake.reset).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('form')).toBeInTheDocument()
  })
})
