import { describe, expect, it, vi } from 'vitest'
import * as z from 'zod/mini'
import { fetchCalls, queueJson, requestBody } from '../test/api'
import { ApiHttpError, ApiNetworkError, ApiPayloadError, apiUrl, requestJson } from './client'

const schema = z.object({ ok: z.literal(true) })

describe('requestJson', () => {
  it('builds /api/v1 URLs on the default base', () => {
    expect(apiUrl('/content?locale=zh-Hant')).toBe('http://localhost:8000/api/v1/content?locale=zh-Hant')
  })

  it('returns the validated body of a 2xx response and ignores unknown keys', async () => {
    queueJson({ ok: true, addedLater: 1 })
    await expect(requestJson('/x', { schema })).resolves.toEqual({ ok: true })
    const [request] = fetchCalls()
    expect(request.url).toBe('http://localhost:8000/api/v1/x')
    expect(request.init).toMatchObject({ method: 'GET', credentials: 'omit' })
    expect(request.init?.headers).toBeUndefined()
  })

  it('posts a JSON body with the content type', async () => {
    queueJson({ ok: true }, { status: 202 })
    await requestJson('/x', { schema, method: 'POST', body: { name: 'Jane' } })
    const [request] = fetchCalls()
    expect(request.init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } })
    expect(requestBody(request)).toEqual({ name: 'Jane' })
  })

  it('maps the contract error shape to ApiHttpError, with fields and Retry-After', async () => {
    queueJson(
      { error: { code: 'validation_error', message: 'Invalid request.', fields: { email: 'invalid' } } },
      { status: 422, headers: { 'Retry-After': '30' } },
    )
    const error = await requestJson('/x', { schema }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiHttpError)
    expect(error).toMatchObject({
      status: 422,
      code: 'validation_error',
      message: 'Invalid request.',
      fields: { email: 'invalid' },
      retryAfter: 30,
    })
  })

  it('falls back to the status when the error body is not the contract shape', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }))
    const error = await requestJson('/x', { schema }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiHttpError)
    expect(error).toMatchObject({ status: 502, code: 'unknown_error', fields: null, retryAfter: null })
  })

  it('ignores a Retry-After that is not whole seconds', async () => {
    queueJson({ error: { code: 'rate_limited', message: 'Slow down.' } }, { status: 429, headers: { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' } })
    const error = await requestJson('/x', { schema }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 429, code: 'rate_limited', retryAfter: null })
  })

  it('rejects a 2xx body the schema does not describe', async () => {
    queueJson({ ok: false })
    await expect(requestJson('/x', { schema })).rejects.toBeInstanceOf(ApiPayloadError)
    vi.mocked(fetch).mockResolvedValueOnce(new Response('not json', { status: 200 }))
    await expect(requestJson('/x', { schema })).rejects.toBeInstanceOf(ApiPayloadError)
  })

  it('wraps a failed fetch as ApiNetworkError', async () => {
    await expect(requestJson('/x', { schema })).rejects.toBeInstanceOf(ApiNetworkError) // the default stub rejects
  })

  it('returns undefined for a 204 without reading a body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(requestJson('/auth/logout', { schema: z.undefined(), method: 'POST' })).resolves.toBeUndefined()
  })

  it('gives up on a backend that never answers, as a network failure', async () => {
    vi.mocked(fetch).mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    const error = await requestJson('/x', { schema, timeoutMs: 20 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiNetworkError)
    expect((error as ApiNetworkError).cause).toMatchObject({ name: 'TimeoutError' })
  })

  it('rethrows an abort untouched', async () => {
    const controller = new AbortController()
    vi.mocked(fetch).mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const pending = requestJson('/x', { schema, signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
