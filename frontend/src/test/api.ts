import { vi } from 'vitest'

/**
 * Helpers for the fetch stub installed by setup.ts. By default every request fails like an
 * unreachable backend; a test queues the responses it wants, in order, before rendering.
 */

interface ResponseInit {
  status?: number
  headers?: Record<string, string>
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
}

/** Queues one JSON response for the next request. */
export function queueJson(body: unknown, init?: ResponseInit): void {
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body, init))
}

/** Queues a response the test releases itself, to observe the pending state in between. */
export function queueDeferred(): { resolve: (response: Response) => void; reject: (error: unknown) => void } {
  let resolve!: (response: Response) => void
  let reject!: (error: unknown) => void
  vi.mocked(fetch).mockReturnValueOnce(
    new Promise<Response>((res, rej) => {
      resolve = res
      reject = rej
    }),
  )
  return { resolve, reject }
}

export interface RecordedRequest {
  url: string
  init: RequestInit | undefined
}

export function fetchCalls(): RecordedRequest[] {
  return vi.mocked(fetch).mock.calls.map(([input, init]) => ({
    url: input instanceof Request ? input.url : String(input),
    init,
  }))
}

export function lastRequest(): RecordedRequest {
  const calls = fetchCalls()
  if (calls.length === 0) throw new Error('fetch was not called')
  return calls[calls.length - 1]
}

export const requestBody = (request: RecordedRequest): unknown => JSON.parse(String(request.init?.body))
