import { requestJson } from './client'
import { contactAcceptedSchema } from './schemas'

/** The body of `POST /api/v1/contact`. `website` is the honeypot: a person never fills it. */
export interface ContactSubmission {
  readonly name: string
  readonly email: string
  readonly message: string
  readonly turnstileToken: string
  readonly website: string
}

/**
 * Submits a contact message. Resolves on 202 Accepted (the message is stored; whether the email
 * went out is deliberately not reported). Rejects with `ApiHttpError` (422 `validation_error` with
 * `fields`, 400 `turnstile_failed`, 429 `rate_limited`, 5xx) or `ApiNetworkError`.
 */
export async function submitContact(submission: ContactSubmission, signal?: AbortSignal): Promise<void> {
  await requestJson('/contact', {
    method: 'POST',
    body: submission,
    schema: contactAcceptedSchema,
    signal,
    credentials: 'omit',
  })
}
