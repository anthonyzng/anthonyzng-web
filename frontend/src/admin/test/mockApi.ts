import { vi } from 'vitest'
import { jsonResponse } from '../../test/api'

/**
 * A fake backend for admin tests, routed by method and path instead of call order: the admin
 * layout, the page and the guard fetch concurrently, so a queue of responses would be brittle.
 * Built on the fetch stub from src/test/setup.ts (reset after every test). An unrouted request
 * fails like an unreachable backend and is recorded in `unrouted`.
 */

export interface ApiCall {
  method: string
  /** The path under /api/v1, without the query. */
  path: string
  url: URL
  init: RequestInit | undefined
  /** The JSON body, or undefined. */
  json: unknown
  /** The FormData body of an upload, or null. */
  form: FormData | null
}

export type Handler = (call: ApiCall) => Response | Promise<Response>

export interface MockedApi {
  calls: ApiCall[]
  unrouted: ApiCall[]
  /** The calls to one route, e.g. `api.to('PATCH /admin/messages/1')`. */
  to(route: string): ApiCall[]
  /** Replaces or adds routes for the rest of the test. */
  route(routes: Record<string, Handler>): void
}

export const ok = (body: unknown, status = 200): Handler => () => jsonResponse(body, { status })
export const noContent: Handler = () => new Response(null, { status: 204 })
export const failWith =
  (status: number, code: string, extra: { fields?: Record<string, string>; headers?: Record<string, string> } = {}): Handler =>
  () =>
    jsonResponse({ error: { code, message: `${code} (test)`, ...(extra.fields ? { fields: extra.fields } : {}) } }, { status, headers: extra.headers })

/** A response the test releases itself, to observe a pending state. */
export function deferred(): { handler: Handler; resolve(response: Response): void } {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => {
    resolve = done
  })
  return { handler: () => promise, resolve }
}

/** Responds `once` the first time, then falls back to `then`. */
export function sequence(...handlers: Handler[]): Handler {
  let index = 0
  return (call) => handlers[Math.min(index++, handlers.length - 1)](call)
}

export function mockApi(initial: Record<string, Handler>): MockedApi {
  const routes: Record<string, Handler> = { ...initial }
  const calls: ApiCall[] = []
  const unrouted: ApiCall[] = []

  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname.replace(/^\/api\/v1/, '')
    const body = init?.body
    const call: ApiCall = {
      method,
      path,
      url,
      init,
      json: typeof body === 'string' ? JSON.parse(body) : undefined,
      form: body instanceof FormData ? body : null,
    }
    calls.push(call)
    const handler = routes[`${method} ${path}`]
    if (!handler) {
      unrouted.push(call)
      throw new TypeError(`Unrouted request in test: ${method} ${path}`)
    }
    return handler(call)
  })

  return {
    calls,
    unrouted,
    to: (route) => calls.filter((call) => `${call.method} ${call.path}` === route),
    route: (next) => Object.assign(routes, next),
  }
}
