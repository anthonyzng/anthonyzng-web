import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { jsonResponse } from '../../test/api'
import { experience, signedIn, siteTexts } from '../test/fixtures'
import { deferred, failWith, mockApi, noContent, ok, sequence } from '../test/mockApi'
import { findPageHeading, renderAdmin, statusRegion } from '../test/renderAdmin'

const ACME = 'Lead Developer · Acme Corp'
const GLOBEX = 'Developer · Globex'
const rows = () => within(screen.getByRole('list', { name: 'Experience' })).getAllByRole('listitem')

describe('content list', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
  })

  it('lists the rows in display order with readable titles and details', async () => {
    mockApi({ ...signedIn(), 'GET /admin/content/experience': ok({ items: experience() }) })
    renderAdmin('/admin/content/experience')
    await findPageHeading('Experience')
    await screen.findByRole('list', { name: 'Experience' })

    const [first, second] = rows()
    expect(first).toHaveTextContent(ACME)
    expect(first).toHaveTextContent('Jan 2023 – Present · acme')
    expect(second).toHaveTextContent(GLOBEX)
    expect(second).toHaveTextContent('Feb 2020 – Dec 2022 · globex')
    expect(within(first).getByRole('link', { name: `Edit ${ACME}` })).toHaveAttribute('href', '/admin/content/experience/acme')
    expect(screen.getByRole('link', { name: 'Add new' })).toHaveAttribute('href', '/admin/content/experience/new')
    // The first row cannot move up, the last cannot move down: announced as unavailable, still focusable.
    expect(screen.getByRole('button', { name: `Move “${ACME}” up` })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: `Move “${GLOBEX}” down` })).toHaveAttribute('aria-disabled', 'true')
  })

  it('moves a row, saves the new order and announces its position, keeping focus on the button', async () => {
    const [acme, globex] = experience()
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/experience': ok({ items: [acme, globex] }),
      'POST /admin/content/experience/reorder': ok({ items: [{ ...globex, sortOrder: 0 }, { ...acme, sortOrder: 1 }] }),
    })
    const { user } = renderAdmin('/admin/content/experience')
    const down = await screen.findByRole('button', { name: `Move “${ACME}” down` })

    await user.click(down)
    await waitFor(() => expect(statusRegion()).toHaveTextContent(`Moved “${ACME}” to position 2 of 2.`))
    const [call] = api.to('POST /admin/content/experience/reorder')
    expect(call.json).toEqual({ slugs: ['globex', 'acme'] })
    expect(call.init?.credentials).toBe('include')
    expect(rows()[0]).toHaveTextContent(GLOBEX)
    expect(rows()[1]).toHaveTextContent(ACME)
    // Same button, same row: now the last one, so moving down again is unavailable.
    const moved = screen.getByRole('button', { name: `Move “${ACME}” down` })
    expect(moved).toHaveFocus()
    expect(moved).toHaveAttribute('aria-disabled', 'true')
  })

  it('rolls a move back and fetches the list again when the order cannot be saved', async () => {
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/experience': ok({ items: experience() }),
      'POST /admin/content/experience/reorder': failWith(422, 'validation_error', { fields: { slugs: 'Stale list' } }),
    })
    const { user } = renderAdmin('/admin/content/experience')
    await user.click(await screen.findByRole('button', { name: `Move “${GLOBEX}” up` }))

    await waitFor(() =>
      expect(statusRegion()).toHaveTextContent('The new order could not be saved. The list has been reloaded; please try again.'),
    )
    expect(rows()[0]).toHaveTextContent(ACME)
    expect(rows()[1]).toHaveTextContent(GLOBEX)
    await waitFor(() => expect(api.to('GET /admin/content/experience')).toHaveLength(2))
  })

  it('keeps the list, and moves built from it, when refreshing it fails; moves wait while it reloads', async () => {
    const [acme, globex] = experience()
    const reordered = [
      { ...globex, sortOrder: 0 },
      { ...acme, sortOrder: 1 },
    ]
    const reloading = deferred()
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/experience': sequence(ok({ items: [acme, globex] }), reloading.handler, ok({ items: reordered })),
      'POST /admin/content/experience/reorder': sequence(
        failWith(422, 'validation_error', { fields: { slugs: 'Stale list' } }),
        ok({ items: reordered }),
      ),
    })
    const { user } = renderAdmin('/admin/content/experience')
    await user.click(await screen.findByRole('button', { name: `Move “${GLOBEX}” up` }))

    // The move failed; while the list is fetched again, moves and deletes wait for it.
    await waitFor(() => expect(api.to('GET /admin/content/experience')).toHaveLength(2))
    expect(screen.getByRole('button', { name: `Move “${GLOBEX}” up` })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: `Delete ${ACME}` })).toHaveAttribute('aria-disabled', 'true')
    reloading.resolve(jsonResponse({ error: { code: 'service_unavailable', message: 'down (test)' } }, { status: 503 }))

    // That failed too: the list stays, under a notice with a retry.
    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent('This could not be refreshed, so what is shown may be out of date.')
    expect(rows()[0]).toHaveTextContent(ACME)

    // A move still works from the list on screen, and the screen follows the server's answer.
    await user.click(screen.getByRole('button', { name: `Move “${GLOBEX}” up` }))
    await waitFor(() => expect(statusRegion()).toHaveTextContent(`Moved “${GLOBEX}” to position 1 of 2.`))
    expect(api.to('POST /admin/content/experience/reorder')[1].json).toEqual({ slugs: ['globex', 'acme'] })
    expect(rows()[0]).toHaveTextContent(GLOBEX)
    expect(rows()[1]).toHaveTextContent(ACME)

    // Retry: focus waits on the heading, and the outcome is announced.
    await user.click(within(notice.parentElement!).getByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Experience' })).toHaveFocus()
    await waitFor(() => expect(statusRegion()).toHaveTextContent('Loaded.'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(rows()[0]).toHaveTextContent(GLOBEX)
  })

  it('holds deletes while a move is being saved', async () => {
    const pending = deferred()
    const [acme, globex] = experience()
    mockApi({
      ...signedIn(),
      'GET /admin/content/experience': ok({ items: [acme, globex] }),
      'POST /admin/content/experience/reorder': pending.handler,
    })
    const { user } = renderAdmin('/admin/content/experience')
    await user.click(await screen.findByRole('button', { name: `Move “${ACME}” down` }))

    const remove = screen.getByRole('button', { name: `Delete ${GLOBEX}` })
    expect(remove).toHaveAttribute('aria-disabled', 'true')
    await user.click(remove)
    expect(screen.queryByRole('dialog')).toBeNull()

    pending.resolve(jsonResponse({ items: [{ ...globex, sortOrder: 0 }, { ...acme, sortOrder: 1 }] }))
    await waitFor(() => expect(screen.getByRole('button', { name: `Delete ${GLOBEX}` })).not.toHaveAttribute('aria-disabled'))
  })

  it('deletes a row only after confirmation; Cancel returns focus to the Delete button', async () => {
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/experience': ok({ items: experience() }),
      'DELETE /admin/content/experience/acme': noContent,
    })
    const { user } = renderAdmin('/admin/content/experience')
    const trigger = await screen.findByRole('button', { name: `Delete ${ACME}` })

    await user.click(trigger)
    let dialog = screen.getByRole('dialog', { name: `Delete “${ACME}”?` })
    expect(dialog).toHaveAccessibleDescription('It disappears from the site at once. This cannot be undone.')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.to('DELETE /admin/content/experience/acme')).toEqual([])

    await user.click(trigger)
    dialog = screen.getByRole('dialog', { name: `Delete “${ACME}”?` })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(statusRegion()).toHaveTextContent(`Deleted “${ACME}”.`))
    expect(rows()).toHaveLength(1)
    expect(api.to('DELETE /admin/content/experience/acme')[0].init?.credentials).toBe('include')
    // The row, and the button that opened the dialog, are gone: focus goes to the page heading.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Experience' })).toHaveFocus())
  })

  it('brings the dialog back if the browser closes it while the delete is running', async () => {
    const pending = deferred()
    mockApi({
      ...signedIn(),
      'GET /admin/content/experience': ok({ items: experience() }),
      'DELETE /admin/content/experience/acme': pending.handler,
    })
    const { user } = renderAdmin('/admin/content/experience')
    await user.click(await screen.findByRole('button', { name: `Delete ${ACME}` }))
    const dialog = screen.getByRole('dialog') as HTMLDialogElement
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(within(dialog).getByRole('button', { name: 'Deleting…' })).toHaveAttribute('aria-disabled', 'true')

    // Chrome lets a second Escape close a modal dialog without a cancelable event.
    dialog.close()
    await waitFor(() => expect(dialog).toHaveAttribute('open'))

    pending.resolve(new Response(null, { status: 204 }))
    await waitFor(() => expect(statusRegion()).toHaveTextContent(`Deleted “${ACME}”.`))
    expect(dialog).not.toHaveAttribute('open')
  })

  it('keeps the dialog open with the reason when a delete fails, and announces it', async () => {
    mockApi({
      ...signedIn(),
      'GET /admin/content/experience': ok({ items: experience() }),
      'DELETE /admin/content/experience/acme': failWith(500, 'internal_error'),
    })
    const { user } = renderAdmin('/admin/content/experience')
    await user.click(await screen.findByRole('button', { name: `Delete ${ACME}` }))
    const dialog = screen.getByRole('dialog')
    // The alert is there, empty, before anything fails: its text arriving is what gets announced.
    const alert = within(dialog).getByRole('alert')
    expect(alert).toBeEmptyDOMElement()
    expect(dialog).toHaveAccessibleDescription('It disappears from the site at once. This cannot be undone.')

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    const reason = 'It could not be deleted. Check your connection and try again.'
    await waitFor(() => expect(alert).toHaveTextContent(reason))
    expect(dialog).toHaveAccessibleDescription(`It disappears from the site at once. This cannot be undone. ${reason}`)
    expect(rows()).toHaveLength(2)

    // A retry clears it while it runs, so a second failure is announced again.
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(alert).toHaveTextContent(reason))
  })

  it('offers only editing for site texts, which have a fixed set of rows', async () => {
    mockApi({ ...signedIn(), 'GET /admin/content/site-texts': ok({ items: siteTexts() }) })
    renderAdmin('/admin/content/site-texts')
    await findPageHeading('Site texts')
    const list = await screen.findByRole('list', { name: 'Site texts' })

    expect(list).toHaveTextContent('Contact section: location line')
    expect(within(list).getByRole('link', { name: 'Edit Contact section: location line' })).toBeInTheDocument()
    expect(within(list).queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Add new' })).toBeNull()
  })

  it('shows a not-found page for an unknown collection', async () => {
    const api = mockApi(signedIn())
    renderAdmin('/admin/content/recipes')
    expect(await findPageHeading('Not found')).toBeInTheDocument()
    expect(api.unrouted).toEqual([])
  })

  it('offers a retry when the list cannot be loaded: each failure is an alert, focus never falls to the page', async () => {
    const api = mockApi({ ...signedIn(), 'GET /admin/content/experience': failWith(503, 'service_unavailable') })
    const { user } = renderAdmin('/admin/content/experience')
    const first = await screen.findByRole('alert')
    expect(first).toHaveTextContent('This could not be loaded. Check your connection and try again.')
    const heading = screen.getByRole('heading', { level: 1, name: 'Experience' })

    // The retry fails again: focus waits on the heading, and the failure is a new alert (announced again).
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(heading).toHaveFocus()
    await waitFor(() => expect(screen.getByRole('alert')).not.toBe(first))
    expect(screen.getByRole('alert')).toHaveTextContent('This could not be loaded.')
    expect(heading).toHaveFocus()

    api.route({ 'GET /admin/content/experience': ok({ items: experience() }) })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(heading).toHaveFocus()
    expect(await screen.findByRole('list', { name: 'Experience' })).toHaveTextContent(ACME)
    expect(statusRegion()).toHaveTextContent('Loaded.')
    expect(heading).toHaveFocus()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
