import { API_BASE_URL } from '../env'
import { apiErrorSchema } from './schemas'

/** What `requestJson` needs from a schema: the `safeParse` of any zod (or zod/mini) type. */
export interface BodySchema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: unknown }
}

/**
 * The one way the app talks to the backend: builds `/api/v1` URLs, sends and receives JSON,
 * honours an AbortSignal and turns every failure into a typed error the caller can map to UI
 * (see the Phase 4 API contract, section 1.1). Nothing here knows about React.
 */

/** A request that produced no usable response: DNS, CORS, offline. An abort is rethrown as is. */
export class ApiNetworkError extends Error {
  override readonly cause: unknown

  constructor(cause: unknown) {
    super('The API could not be reached.')
    this.name = 'ApiNetworkError'
    this.cause = cause
  }
}

/** A non-2xx response. `code` and `fields` follow the contract; `retryAfter` is in seconds (429). */
export class ApiHttpError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Readonly<Record<string, string>> | null
  readonly retryAfter: number | null

  constructor(
    status: number,
    code: string,
    message: string,
    fields: Readonly<Record<string, string>> | null,
    retryAfter: number | null,
  ) {
    super(message)
    this.name = 'ApiHttpError'
    this.status = status
    this.code = code
    this.fields = fields
    this.retryAfter = retryAfter
  }
}

/** A 2xx response whose body is not the JSON the schema describes. */
export class ApiPayloadError extends Error {
  override readonly cause: unknown

  constructor(cause: unknown) {
    super('The API returned an unexpected payload.')
    this.name = 'ApiPayloadError'
    this.cause = cause
  }
}

const errorName = (error: unknown): unknown =>
  typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined

/** By name, not `instanceof`: an AbortError is a DOMException, which may come from another realm. */
export const isAbortError = (error: unknown): boolean => errorName(error) === 'AbortError'

/** The abort `AbortSignal.timeout` raises: the backend never answered, which is a network failure. */
const isTimeoutError = (error: unknown): boolean => errorName(error) === 'TimeoutError'

export const apiUrl = (path: string): string => `${API_BASE_URL}/api/v1${path}`

/** How long a request may take before it counts as failed (a form must never hang on "Sending"). */
export const REQUEST_TIMEOUT_MS = 15_000

interface RequestOptions<T> {
  /** Validates and types the 2xx body. */
  schema: BodySchema<T>
  method?: 'GET' | 'POST'
  /** Serialised as JSON; sets `Content-Type: application/json`. */
  body?: unknown
  signal?: AbortSignal
  /** `'omit'` for the public routes (a simple request, no preflight); `'include'` only for `/auth/*`. */
  credentials?: RequestCredentials
  timeoutMs?: number
}

/**
 * The caller's signal plus a deadline. Browsers without `AbortSignal.any` / `timeout` keep the
 * caller's signal alone and rely on their own connection timeout.
 */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal.any !== 'function' || typeof AbortSignal.timeout !== 'function') return signal
  const deadline = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, deadline]) : deadline
}

/**
 * Fetches `${API_BASE_URL}/api/v1${path}` and returns the validated body (`undefined` for a
 * 204). Throws `ApiHttpError` for a non-2xx status (parsing the contract's error shape when
 * present), `ApiPayloadError` for a 2xx body the schema rejects, `ApiNetworkError` when `fetch`
 * itself fails or the deadline passes, and rethrows the caller's own abort untouched so callers
 * can tell it apart.
 */
export async function requestJson<T>(path: string, options: RequestOptions<T>): Promise<T> {
  const { schema, method = 'GET', body, signal, credentials = 'omit', timeoutMs = REQUEST_TIMEOUT_MS } = options
  const init: RequestInit = { method, signal: withTimeout(signal, timeoutMs), credentials }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(apiUrl(path), init)
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiNetworkError(error)
  }

  if (!response.ok) throw await toHttpError(response)

  let data: unknown
  if (response.status !== 204) {
    try {
      data = await response.json()
    } catch (error) {
      if (isAbortError(error)) throw error
      if (isTimeoutError(error)) throw new ApiNetworkError(error)
      throw new ApiPayloadError(error)
    }
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new ApiPayloadError(parsed.error)
  return parsed.data
}

async function toHttpError(response: Response): Promise<ApiHttpError> {
  let code = 'unknown_error'
  let message = `HTTP ${response.status}`
  let fields: Readonly<Record<string, string>> | null = null
  try {
    const parsed = apiErrorSchema.safeParse(await response.json())
    if (parsed.success) {
      code = parsed.data.error.code
      message = parsed.data.error.message
      fields = parsed.data.error.fields ?? null
    }
  } catch {
    // A body that is not JSON (a proxy error page): the status alone has to do.
  }
  return new ApiHttpError(response.status, code, message, fields, parseRetryAfter(response.headers.get('Retry-After')))
}

/** The contract sends whole seconds; anything else (an HTTP date, garbage) counts as unknown. */
function parseRetryAfter(header: string | null): number | null {
  if (header === null) return null
  const seconds = Number(header.trim())
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : null
}
