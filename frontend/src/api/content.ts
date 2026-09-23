import type { Locale, ResolvedContent } from '../content/resolved'
import { requestJson } from './client'
import { contentPayloadSchema } from './schemas'

/**
 * `GET /api/v1/content?locale=...`: the whole site content, resolved for one locale. A simple
 * request (no custom headers, no credentials), so the browser sends it without a preflight and
 * may cache it for the minute the backend allows.
 */
export function fetchContent(locale: Locale, signal?: AbortSignal): Promise<ResolvedContent> {
  return requestJson(`/content?locale=${encodeURIComponent(locale)}`, {
    schema: contentPayloadSchema,
    signal,
    credentials: 'omit',
  })
}
