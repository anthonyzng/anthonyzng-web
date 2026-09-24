import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { jsonResponse } from '../../test/api'
import { navigation } from '../../test/navigation'
import type { Message } from '../schemas'
import { message, signedIn, summary } from '../test/fixtures'
import { deferred, failWith, mockApi, noContent, ok, sequence, type ApiCall, type Handler } from '../test/mockApi'
import { findPageHeading, renderAdmin, statusRegion } from '../test/renderAdmin'

/** The moment the server says a first page was taken at (it keeps the microseconds). */
const AS_OF = '2026-09-23T12:00:00.123456Z'

const JANE = message({ id: 1, deliveryStatus: 'failed', deliveryError: 'Provider said no' })
const JOHN = message({
  id: 2,
  name: 'John Roe',
  email: 'john@example.com',
  message: 'A short note.',
  createdAt: '2026-09-18T09:00:00Z',
  readAt: '2026-09-18T10:00:00Z',
  userAgent: null,
  source: 'unknown',
})

/** One page of the inbox as the API answers it. */
const inboxPage = (items: Message[], total: number, unread: number, asOf = AS_OF): Handler =>
  ok({ items, total, unread, asOf })

const inbox = () => screen.getByRole('list', { name: 'Messages' })
const toggle = (name: RegExp) => within(inbox()).getByRole('button', { name })
const heading = () => screen.getByRole('heading', { level: 1, name: 'Messages' })
const pagination = () => screen.getByRole('navigation', { name: 'Pages' })
/** A PATCH that answers with the message read or unread, as the backend does. */
const patchRead = (base: Message) => (call: ApiCall) =>
  ok({ ...base, readAt: (call.json as { read: boolean }).read ? '2026-09-23T12:00:00Z' : null })(call)

describe('messages', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
  })

  it('lists newest first with unread and delivery-failure marks', async () => {
    const api = mockApi({ ...signedIn(), 'GET /admin/messages': inboxPage([JANE, JOHN], 2, 1) })
    renderAdmin('/admin/messages')
    await findPageHeading('Messages')
    await screen.findByRole('list', { name: 'Messages' })

    expect(screen.getByText('2 messages')).toBeInTheDocument()
    const [first, second] = within(inbox()).getAllByRole('listitem')
    expect(within(first).getByRole('heading', { level: 2 })).toHaveTextContent('Jane Doe')
    expect(first).toHaveTextContent('Unread')
    expect(first).toHaveTextContent('Delivery failed')
    expect(first).toHaveTextContent('Hello there. Could we talk about a project?')
    expect(second).not.toHaveTextContent('Unread')
    const [request] = api.to('GET /admin/messages')
    expect(request.url.searchParams.get('status')).toBe('all')
    expect(request.url.searchParams.get('limit')).toBe('50')
    expect(request.url.searchParams.get('offset')).toBe('0')
    // The first page is taken as of now: no asOf in the request.
    expect(request.url.searchParams.has('asOf')).toBe(false)
    expect(request.init?.credentials).toBe('include')
    // The inbox's own count feeds the navigation badge (after the list renders), over the summary's older 2.
    expect(await screen.findByRole('link', { name: 'Messages 1 unread' })).toBeInTheDocument()
  })

  it('opening a message shows it in full and marks it read; Mark unread closes it again', async () => {
    // The server's count follows the read flag, as the backend's does.
    let unreadOnServer = 1
    const api = mockApi({
      ...signedIn(),
      'GET /admin/summary': (call) => ok(summary({ unreadMessages: unreadOnServer }))(call),
      'GET /admin/messages': inboxPage([JANE, JOHN], 2, 1),
      'PATCH /admin/messages/1': (call) => {
        unreadOnServer = (call.json as { read: boolean }).read ? 0 : 1
        return patchRead(JANE)(call)
      },
    })
    const { user } = renderAdmin('/admin/messages')
    await screen.findByRole('list', { name: 'Messages' })
    const jane = toggle(/Jane Doe/)
    expect(jane).toHaveAttribute('aria-expanded', 'false')

    await user.click(jane)
    expect(jane).toHaveAttribute('aria-expanded', 'true')
    const panel = document.getElementById(jane.getAttribute('aria-controls')!)!
    expect(panel).toHaveTextContent('Could we talk about a project?')
    expect(within(panel).getByRole('link', { name: 'Reply jane@example.com' })).toHaveAttribute(
      'href',
      'mailto:jane@example.com',
    )
    expect(panel).toHaveTextContent('3fa2c19b0e4d')
    expect(panel).toHaveTextContent('TestBrowser/1.0')
    expect(panel).toHaveTextContent('Failed: Provider said no')
    await waitFor(() => expect(api.to('PATCH /admin/messages/1')[0]?.json).toEqual({ read: true }))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Messages' })).toBeInTheDocument())
    expect(within(inbox()).getAllByRole('listitem')[0]).not.toHaveTextContent('Unread')

    await user.click(within(panel).getByRole('button', { name: 'Mark unread' }))
    await waitFor(() => expect(statusRegion()).toHaveTextContent('Marked the message from Jane Doe as unread.'))
    expect(api.to('PATCH /admin/messages/1')[1].json).toEqual({ read: false })
    expect(jane).toHaveAttribute('aria-expanded', 'false')
    expect(jane).toHaveFocus()
    expect(screen.getByRole('link', { name: 'Messages 1 unread' })).toBeInTheDocument()
  })

  it('takes the badge from the server after a change, not only from local arithmetic', async () => {
    // Another message arrived meanwhile: after the change the badge shows the server's count (1),
    // not just the local arithmetic (1 - 1 = 0).
    const api = mockApi({
      ...signedIn(),
      'GET /admin/summary': ok(summary({ unreadMessages: 1 })),
      'GET /admin/messages': inboxPage([JANE], 1, 1),
      'PATCH /admin/messages/1': patchRead(JANE),
    })
    const { user } = renderAdmin('/admin/messages')
    await screen.findByRole('list', { name: 'Messages' })
    await user.click(toggle(/Jane Doe/))
    await waitFor(() => expect(api.to('GET /admin/summary').length).toBeGreaterThanOrEqual(2))
    expect(await screen.findByRole('link', { name: 'Messages 1 unread' })).toBeInTheDocument()
  })

  it('holds Mark unread and Delete while the message is being marked read', async () => {
    const pending = deferred()
    const api = mockApi({
      ...signedIn(),
      'GET /admin/messages': inboxPage([JANE], 1, 1),
      'PATCH /admin/messages/1': pending.handler,
    })
    const { user } = renderAdmin('/admin/messages')
    await screen.findByRole('list', { name: 'Messages' })
    await user.click(toggle(/Jane Doe/))

    const markUnread = screen.getByRole('button', { name: 'Mark unread' })
    expect(markUnread).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(markUnread)
    expect(api.to('PATCH /admin/messages/1')).toHaveLength(1)

    pending.resolve(jsonResponse({ ...JANE, readAt: '2026-09-23T12:00:00Z' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark unread' })).not.toHaveAttribute('aria-disabled'))
  })

  it('does not mark an already-read message again', async () => {
    const api = mockApi({ ...signedIn(), 'GET /admin/messages': inboxPage([JOHN], 1, 0) })
    const { user } = renderAdmin('/admin/messages')
    await screen.findByRole('list', { name: 'Messages' })
    await user.click(toggle(/John Roe/))
    const panel = document.getElementById(toggle(/John Roe/).getAttribute('aria-controls')!)!
    expect(panel).toHaveTextContent('Unknown') // no source fingerprint
    expect(panel).toHaveTextContent('Not recorded') // no user agent
    expect(api.calls.filter((call) => call.method === 'PATCH')).toEqual([])
  })

  it('deletes a message after confirmation and refreshes the page as of the same moment', async () => {
    const api = mockApi({
      ...signedIn(),
      'GET /admin/messages': inboxPage([JANE, JOHN], 2, 1),
      'DELETE /admin/messages/2': noContent,
    })
    const { user } = renderAdmin('/admin/messages')
    await screen.findByRole('list', { name: 'Messages' })
    await user.click(toggle(/John Roe/))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const dialog = screen.getByRole('dialog', { name: 'Delete the message from John Roe?' })
    api.route({ 'GET /admin/messages': inboxPage([JANE], 1, 1) })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(statusRegion()).toHaveTextContent('Deleted the message from John Roe.'))
    expect(api.to('DELETE /admin/messages/2')).toHaveLength(1)
    await waitFor(() => expect(within(inbox()).getAllByRole('listitem')).toHaveLength(1))
    const [first, again] = api.to('GET /admin/messages')
    expect(again).toBeDefined()
    // Page 1 carries no asOf in its URL: the refresh still names the moment the page was taken at,
    // so a message read meanwhile stays in the unread view and new arrivals do not shift it.
    expect(first.url.searchParams.has('asOf')).toBe(false)
    expect(again.url.searchParams.get('asOf')).toBe(AS_OF)
    await waitFor(() => expect(heading()).toHaveFocus())
  })

  it('pages through 50 messages at a time as of the first page, and a view or page 1 starts afresh', async () => {
    const LATER = '2026-09-23T12:30:00Z'
    const page = (offset: number): Message[] =>
      Array.from({ length: 50 }, (_, index) => message({ id: offset + index + 1, name: `Sender ${offset + index + 1}` }))
    let fresh = AS_OF
    const api = mockApi({
      ...signedIn(),
      'GET /admin/messages': (call) => {
        const offset = Number(call.url.searchParams.get('offset'))
        const unreadOnly = call.url.searchParams.get('status') === 'unread'
        // Like the backend: the moment it was given, or a fresh one for a first page.
        const asOf = call.url.searchParams.get('asOf') ?? fresh
        return ok({ items: unreadOnly ? page(0).slice(0, 3) : page(offset), total: unreadOnly ? 3 : 120, unread: 3, asOf })(call)
      },
    })
    const { user } = renderAdmin('/admin/messages')
    await screen.findByRole('list', { name: 'Messages' })
    expect(within(pagination()).getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Previous page' })).toBeNull()
    const last = () => api.to('GET /admin/messages').at(-1)!

    await user.click(screen.getByRole('link', { name: 'Next page' }))
    await waitFor(() => expect(within(pagination()).getByText('Page 2 of 3')).toBeInTheDocument())
    expect(last().url.searchParams.get('offset')).toBe('50')
    // Later pages keep the first page's moment, in the request and in the URL (so reload and Back keep it).
    expect(last().url.searchParams.get('asOf')).toBe(AS_OF)
    expect(new URLSearchParams(navigation.location?.search).get('asOf')).toBe(AS_OF)
    expect(within(inbox()).getAllByRole('button')[0]).toHaveTextContent('Sender 51')
    // Focus is on the heading, not on <body>, and the new page is announced.
    await waitFor(() => expect(heading()).toHaveFocus())
    await waitFor(() => expect(statusRegion()).toHaveTextContent('Page 2 of 3'))

    fresh = LATER
    await user.click(screen.getByRole('link', { name: 'Next page' }))
    await waitFor(() => expect(within(pagination()).getByText('Page 3 of 3')).toBeInTheDocument())
    expect(last().url.searchParams.get('asOf')).toBe(AS_OF)
    await waitFor(() => expect(statusRegion()).toHaveTextContent('Page 3 of 3'))

    await user.click(screen.getByRole('link', { name: 'Previous page' }))
    await waitFor(() => expect(within(pagination()).getByText('Page 2 of 3')).toBeInTheDocument())
    expect(last().url.searchParams.get('asOf')).toBe(AS_OF)
    await waitFor(() => expect(heading()).toHaveFocus())

    // Page 1 is taken afresh, and its moment goes with the pages after it.
    await user.click(screen.getByRole('link', { name: 'Previous page' }))
    await waitFor(() => expect(within(pagination()).getByText('Page 1 of 3')).toBeInTheDocument())
    expect(last().url.searchParams.has('asOf')).toBe(false)
    expect(navigation.location?.search).toBe('')
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      `/admin/messages?page=2&asOf=${encodeURIComponent(LATER)}`,
    )

    // So is another view.
    await user.click(screen.getByRole('link', { name: 'Unread' }))
    await waitFor(() => expect(screen.getByText('3 messages')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Unread' })).toHaveAttribute('aria-current', 'page')
    expect(last().url.searchParams.get('status')).toBe('unread')
    expect(last().url.searchParams.get('offset')).toBe('0')
    expect(last().url.searchParams.has('asOf')).toBe(false)
  })

  it('reads the page and asOf from the URL defensively', async () => {
    const api = mockApi({ ...signedIn(), 'GET /admin/messages': inboxPage([JANE], 1, 1) })
    // Not a sane page number: page 1, which never keeps an asOf.
    renderAdmin(`/admin/messages?page=99999999999&asOf=${encodeURIComponent(AS_OF)}`)
    await screen.findByRole('list', { name: 'Messages' })
    const [request] = api.to('GET /admin/messages')
    expect(request.url.searchParams.get('offset')).toBe('0')
    expect(request.url.searchParams.has('asOf')).toBe(false)
  })

  it('keeps the inbox on screen when refreshing it fails, with a retry', async () => {
    mockApi({
      ...signedIn(),
      'GET /admin/messages': sequence(inboxPage([JANE, JOHN], 2, 1), failWith(503, 'service_unavailable'), inboxPage([JANE], 1, 1)),
      'DELETE /admin/messages/2': noContent,
    })
    const { user } = renderAdmin('/admin/messages')
    await screen.findByRole('list', { name: 'Messages' })
    await user.click(toggle(/John Roe/))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    // The refresh after the delete failed: the messages stay (the deleted one gone), under a notice.
    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent('This could not be refreshed, so what is shown may be out of date.')
    expect(within(inbox()).getAllByRole('listitem')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(heading()).toHaveFocus()
    await waitFor(() => expect(statusRegion()).toHaveTextContent('Loaded.'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(within(inbox()).getAllByRole('listitem')).toHaveLength(1)
  })

  it('says so when the inbox is empty', async () => {
    mockApi({ ...signedIn(), 'GET /admin/messages': inboxPage([], 0, 0) })
    renderAdmin('/admin/messages?status=unread')
    expect(await screen.findByText('No unread messages.')).toBeInTheDocument()
  })

  it('returns to the login page when the session expired', async () => {
    mockApi({ ...signedIn(), 'GET /admin/messages': failWith(401, 'unauthorized') })
    renderAdmin('/admin/messages')
    expect(await findPageHeading('Sign in')).toBeInTheDocument()
    expect(screen.getByText('Your session has expired. Sign in again to continue where you left off.')).toBeInTheDocument()
  })
})
