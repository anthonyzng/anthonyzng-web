import { ApiHttpError, requestJson, type BodySchema, type RequestMethod } from '../api/client'
import type { Json } from './draft'
import type { Collection, ContentItem } from './collections'
import {
  adminInfoSchema,
  cvResponseSchema,
  messageSchema,
  messagesPageSchema,
  noContentSchema,
  projectItemSchema,
  summarySchema,
  type CvRef,
  type Message,
  type MessagesPage,
  type ProjectItem,
  type Summary,
} from './schemas'

/**
 * The admin panel's calls to the backend, all through `requestJson`. Every `/auth/*` and
 * `/admin/*` request carries the session cookie (`credentials: 'include'`); a 401 surfaces as an
 * `ApiHttpError` the pages hand to the session (`isUnauthorized`), which returns to the login page.
 */

/** Uploads may take a while on a slow link: a larger deadline than the 15 s default. */
const UPLOAD_TIMEOUT_MS = 120_000

interface Call<T> {
  schema: BodySchema<T>
  method?: RequestMethod
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
  headers?: Readonly<Record<string, string>>
}

const call = <T>(path: string, options: Call<T>): Promise<T> => requestJson(path, { ...options, credentials: 'include' })

/** A 401 from any admin call: the session is gone (expired, revoked or signed out elsewhere). */
export const isUnauthorized = (error: unknown): boolean => error instanceof ApiHttpError && error.status === 401

/** A 412 on an update: the row was saved elsewhere since the version the edit started from. */
export const isChangedElsewhere = (error: unknown): boolean => error instanceof ApiHttpError && error.status === 412

const segment = (value: string | number): string => encodeURIComponent(String(value))

// Auth

export interface LoginRequest {
  email: string
  password: string
  /** The Turnstile widget's token; single-use, so every attempt needs a fresh one. */
  turnstileToken: string
}

export const login = ({ email, password, turnstileToken }: LoginRequest, signal?: AbortSignal): Promise<{ email: string }> =>
  call('/auth/login', { method: 'POST', body: { email, password, turnstileToken }, schema: adminInfoSchema, signal })

export const fetchMe = (signal?: AbortSignal): Promise<{ email: string }> => call('/auth/me', { schema: adminInfoSchema, signal })

export const logout = (): Promise<void> => call('/auth/logout', { method: 'POST', schema: noContentSchema })

// Dashboard

export const fetchSummary = (signal?: AbortSignal): Promise<Summary> => call('/admin/summary', { schema: summarySchema, signal })

// Content

const contentPath = (collection: Collection, slug?: string): string =>
  `/admin/content/${collection.id}${slug === undefined ? '' : `/${segment(slug)}`}`

/**
 * The display order (`sortOrder`), applied again so the list and its move buttons never depend on
 * the server having sorted. The sort is stable: rows that share an order keep the server's slug
 * order, which follows the database collation (a JavaScript comparison could disagree with it).
 */
const displayOrder = (items: ContentItem[]): ContentItem[] =>
  [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

export async function listItems(collection: Collection, signal?: AbortSignal): Promise<ContentItem[]> {
  const { items } = await call(contentPath(collection), { schema: collection.listSchema, signal })
  return displayOrder(items)
}

/** No `sortOrder` in the payload: the server places a new row (by date for experience, else last). */
export const createItem = (
  collection: Collection,
  payload: Record<string, Json>,
  signal?: AbortSignal,
): Promise<ContentItem> => call(contentPath(collection), { method: 'POST', body: payload, schema: collection.itemSchema, signal })

/**
 * Replaces the row; without `sortOrder` in the payload the server keeps its order. `version` is the
 * `updatedAt` of the row the edit started from, exactly as the API returned it, sent as `If-Match`:
 * if the row was saved elsewhere since, the server changes nothing and answers 412
 * (`isChangedElsewhere`).
 */
export const updateItem = (
  collection: Collection,
  slug: string,
  payload: Record<string, Json>,
  version: string,
  signal?: AbortSignal,
): Promise<ContentItem> =>
  call(contentPath(collection, slug), {
    method: 'PUT',
    body: payload,
    headers: { 'If-Match': `"${version}"` },
    schema: collection.itemSchema,
    signal,
  })

export const deleteItem = (collection: Collection, slug: string, signal?: AbortSignal): Promise<void> =>
  call(contentPath(collection, slug), { method: 'DELETE', schema: noContentSchema, signal })

/** `slugs` must be exactly the collection's slugs, in the new order; the response has `sortOrder` rewritten 0..n-1. */
export async function reorderItems(
  collection: Collection,
  slugs: readonly string[],
  signal?: AbortSignal,
): Promise<ContentItem[]> {
  const { items } = await call(`${contentPath(collection)}/reorder`, {
    method: 'POST',
    body: { slugs },
    schema: collection.listSchema,
    signal,
  })
  return displayOrder(items)
}

const fileForm = (file: File): FormData => {
  const form = new FormData()
  form.append('file', file)
  return form
}

export const uploadProjectImage = (slug: string, file: File, signal?: AbortSignal): Promise<ProjectItem> =>
  call(`/admin/content/projects/${segment(slug)}/image`, {
    method: 'PUT',
    body: fileForm(file),
    schema: projectItemSchema,
    signal,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  })

export const deleteProjectImage = (slug: string, signal?: AbortSignal): Promise<ProjectItem> =>
  call(`/admin/content/projects/${segment(slug)}/image`, { method: 'DELETE', schema: projectItemSchema, signal })

// CV

export async function fetchCv(signal?: AbortSignal): Promise<CvRef | null> {
  const { cv } = await call('/admin/cv', { schema: cvResponseSchema, signal })
  return cv
}

export async function uploadCv(file: File, signal?: AbortSignal): Promise<CvRef | null> {
  const { cv } = await call('/admin/cv', {
    method: 'PUT',
    body: fileForm(file),
    schema: cvResponseSchema,
    signal,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  })
  return cv
}

export async function deleteCv(signal?: AbortSignal): Promise<void> {
  await call('/admin/cv', { method: 'DELETE', schema: cvResponseSchema, signal })
}

// Messages

/** All messages or only the unread ones (the API's `status` parameter). */
export type MessageView = 'all' | 'unread'

export const MESSAGES_PAGE_SIZE = 50

/**
 * One page of the inbox. `asOf` is the moment the first page was taken at (its answer's `asOf`):
 * later pages pass it back, so messages that arrive or are read meanwhile never shift them. The
 * first page leaves it out and gets a fresh one.
 */
export function fetchMessages(view: MessageView, offset: number, asOf: string | null, signal?: AbortSignal): Promise<MessagesPage> {
  const query = new URLSearchParams({ status: view, limit: String(MESSAGES_PAGE_SIZE), offset: String(offset) })
  if (asOf !== null) query.set('asOf', asOf)
  return call(`/admin/messages?${query}`, { schema: messagesPageSchema, signal })
}

export const setMessageRead = (id: number, read: boolean, signal?: AbortSignal): Promise<Message> =>
  call(`/admin/messages/${segment(id)}`, { method: 'PATCH', body: { read }, schema: messageSchema, signal })

export const deleteMessage = (id: number, signal?: AbortSignal): Promise<void> =>
  call(`/admin/messages/${segment(id)}`, { method: 'DELETE', schema: noContentSchema, signal })
