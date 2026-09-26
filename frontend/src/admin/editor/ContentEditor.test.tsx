import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { jsonResponse } from '../../test/api'
import { navigation } from '../../test/navigation'
import { writeDraft } from '../draftStore'
import type { CertificationItem, ExperienceItem } from '../schemas'
import { ADMIN_EMAIL, certifications, experience, loginResult, signedIn, skillGroups } from '../test/fixtures'
import { deferred, failWith, mockApi, noContent, ok, sequence, type ApiCall, type Handler } from '../test/mockApi'
import { findPageHeading, renderAdmin, statusRegion } from '../test/renderAdmin'

const UPDATED = '2026-09-23T12:00:00Z'
/** A save that answers with what it was sent plus what the server adds (its order, a new version), as the backend does. */
const echo =
  (status = 200, extra: Record<string, unknown> = {}): Handler =>
  (call: ApiCall) =>
    ok({ sortOrder: 0, ...(call.json as object), ...extra, updatedAt: UPDATED }, status)(call)

/** The If-Match header a save was sent with. */
const ifMatch = (call: ApiCall) => new Headers(call.init?.headers).get('If-Match')

const group = (name: string, container: HTMLElement = document.body) => within(container).getByRole('group', { name })
const inGroup = (name: string, label: string, container?: HTMLElement) => within(group(name, container)).getByLabelText(label)
const formErrorBox = async () => (await screen.findByText('The entry was not saved:')).parentElement!

describe('content editor', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
  })

  it('creates an entry in the write shape, leaves its place to the server and returns to the list', async () => {
    const created: ExperienceItem = {
      slug: 'initech',
      sortOrder: 0,
      company: 'Initech',
      companyUrl: null,
      start: '2024-03',
      end: null,
      tech: ['Go', { en: 'Testing', 'zh-Hant': '測試' }],
      translations: {
        en: { role: 'Engineer', location: 'Austin', bullets: ['Shipped things.', 'Mentored.'] },
        'zh-Hant': { role: '工程師', location: '奧斯汀', bullets: ['交付項目。', '指導。'] },
      },
      updatedAt: UPDATED,
    }
    const api = mockApi({
      ...signedIn(),
      // The form's list, then the list page after the save: nothing is read in between.
      'GET /admin/content/experience': sequence(ok({ items: experience() }), ok({ items: [created, ...experience()] })),
      'POST /admin/content/experience': ok(created, 201),
    })
    const { user } = renderAdmin('/admin/content/experience/new')
    await findPageHeading('New entry in Experience')

    await user.type(await screen.findByLabelText('Company'), 'Initech')
    // The slug follows the company until it is typed by hand.
    expect(screen.getByLabelText('Slug')).toHaveValue('initech')
    await user.type(inGroup('Role', 'English'), 'Engineer')
    await user.type(inGroup('Role', 'Traditional Chinese'), '工程師')
    expect(inGroup('Role', 'Traditional Chinese')).toHaveAttribute('lang', 'zh-Hant')
    await user.type(inGroup('Location', 'English'), 'Austin')
    await user.type(inGroup('Location', 'Traditional Chinese'), '奧斯汀')
    fireEvent.change(screen.getByLabelText('Start month'), { target: { value: '2024-03' } })
    await user.click(screen.getByLabelText('I currently work here (shown as “Present”)'))
    expect(screen.queryByLabelText('End month')).toBeNull()

    const tech = group('Technologies (optional)')
    await user.click(within(tech).getByRole('button', { name: 'Add proper noun' }))
    expect(within(tech).getByLabelText('Text')).toHaveFocus()
    await user.keyboard('Go')
    await user.click(within(tech).getByRole('button', { name: 'Add translated term' }))
    expect(inGroup('chip 2', 'English', tech)).toHaveFocus()
    await user.keyboard('Testing')
    await user.type(inGroup('chip 2', 'Traditional Chinese', tech), '測試')

    const bullets = group('Bullet points')
    await user.type(inGroup('bullet 1', 'English', bullets), 'Shipped things.')
    await user.type(inGroup('bullet 1', 'Traditional Chinese', bullets), '交付項目。')
    await user.click(within(bullets).getByRole('button', { name: 'Add bullet' }))
    expect(inGroup('bullet 2', 'English', bullets)).toHaveFocus()
    await user.keyboard('Mentored.')
    await user.type(inGroup('bullet 2', 'Traditional Chinese', bullets), '指導。')

    await user.click(screen.getByRole('button', { name: 'Create entry' }))
    expect(await findPageHeading('Experience')).toBeInTheDocument()
    expect(statusRegion()).toHaveTextContent('Created “Engineer · Initech”.')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Experience' })).toHaveFocus())

    const [post] = api.to('POST /admin/content/experience')
    expect(post.init?.credentials).toBe('include')
    // No sortOrder: the server places a new row (by date, for experience).
    expect(post.json).toEqual({
      slug: 'initech',
      company: 'Initech',
      companyUrl: null,
      start: '2024-03',
      end: null,
      tech: ['Go', { en: 'Testing', 'zh-Hant': '測試' }],
      translations: {
        en: { role: 'Engineer', location: 'Austin', bullets: ['Shipped things.', 'Mentored.'] },
        'zh-Hant': { role: '工程師', location: '奧斯汀', bullets: ['交付項目。', '指導。'] },
      },
    })
    expect(api.calls.filter((call) => call.path.startsWith('/admin/content')).map((call) => call.method)).toEqual([
      'GET',
      'POST',
      'GET',
    ])
  })

  it('shows a save message on the list it returns to, and only there, and only once', async () => {
    mockApi({
      ...signedIn(),
      'GET /admin/content/certifications': ok({ items: certifications() }),
      'PUT /admin/content/certifications/pm202': echo(),
    })
    const { user } = renderAdmin('/admin/content/certifications/pm202')
    await user.type(await screen.findByLabelText('Certification'), '!')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await findPageHeading('Certifications')
    expect(statusRegion()).toHaveTextContent('Saved “Project Management 202!”.')

    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    await findPageHeading('Dashboard')
    expect(statusRegion()).toBeEmptyDOMElement()
    await user.click(screen.getByRole('link', { name: 'Certifications' }))
    await findPageHeading('Certifications')
    expect(statusRegion()).toBeEmptyDOMElement()
  })

  it('saves an edit with PUT and If-Match: same slug, no order, read-only keys left out, nothing read first', async () => {
    const [, pm] = certifications()
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/certifications': ok({ items: certifications() }),
      'PUT /admin/content/certifications/pm202': echo(),
    })
    const { user } = renderAdmin('/admin/content/certifications/pm202')
    await findPageHeading('Edit “Project Management 202”')

    // The slug is shown, not editable.
    expect(await screen.findByText('pm202')).toBeInTheDocument()
    expect(screen.queryByLabelText('Slug')).toBeNull()
    const name = screen.getByLabelText('Certification')
    await user.clear(name)
    await user.type(name, '  Project Management 303  ')
    await user.click(screen.getByLabelText('In progress'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await findPageHeading('Certifications')).toBeInTheDocument()
    expect(statusRegion()).toHaveTextContent('Saved “Project Management 303”.')
    const [put] = api.to('PUT /admin/content/certifications/pm202')
    // The server keeps the row's place: no sortOrder is sent.
    expect(put.json).toEqual({ slug: 'pm202', name: 'Project Management 303', inProgress: false })
    // The version the edit started from, exactly as the API returned it, quoted.
    expect(ifMatch(put)).toBe(`"${pm.updatedAt}"`)
    expect(new Headers(put.init?.headers).get('Content-Type')).toBe('application/json')
    expect(api.calls.filter((call) => call.path.startsWith('/admin/content')).map((call) => call.method)).toEqual([
      'GET',
      'PUT',
      'GET',
    ])
  })

  it('checks the form before sending: required fields, slug rules, focus on the first fault', async () => {
    const api = mockApi({ ...signedIn(), 'GET /admin/content/certifications': ok({ items: certifications() }) })
    const { user } = renderAdmin('/admin/content/certifications/new')
    await findPageHeading('New entry in Certifications')
    const name = await screen.findByLabelText('Certification')

    await user.click(screen.getByRole('button', { name: 'Create entry' }))
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('Please fill this in.')
    expect(name).toHaveFocus()
    expect(screen.getByLabelText('Slug')).toHaveAttribute('aria-invalid', 'true')
    expect(statusRegion()).toHaveTextContent('Not saved. Please check the highlighted fields.')

    await user.type(name, 'Cloud Basics 101')
    const slug = screen.getByLabelText('Slug')
    expect(slug).toHaveValue('cloud-basics-101')
    expect(name).not.toHaveAttribute('aria-invalid')

    for (const [value, message] of [
      ['Bad Slug', 'Start with a lower-case letter, then use only letters, digits, - and _ (up to 64 characters).'],
      ['new', '“new” is reserved. Please choose another slug.'],
      ['cloud101', 'Another entry already uses this slug.'],
    ] as const) {
      await user.clear(slug)
      await user.type(slug, value)
      await user.click(screen.getByRole('button', { name: 'Create entry' }))
      expect(slug).toHaveAccessibleDescription(expect.stringContaining(message))
      expect(slug).toHaveFocus()
    }
    expect(api.to('POST /admin/content/certifications')).toEqual([])
  })

  it('takes focus to a chip list whose error is about the list as a whole', async () => {
    const api = mockApi({ ...signedIn(), 'GET /admin/content/skill-groups': ok({ items: skillGroups() }) })
    const { user } = renderAdmin('/admin/content/skill-groups/frontend')
    const skills = await screen.findByRole('group', { name: 'Skills' })
    await user.click(within(skills).getByRole('button', { name: 'Remove chip 2' }))
    await user.click(within(skills).getByRole('button', { name: 'Remove chip 1' }))
    expect(within(skills).getByText('No chips yet.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    // No chip to put the error on: the add button carries it, and takes focus.
    const add = within(skills).getByRole('button', { name: 'Add proper noun' })
    expect(add).toHaveAttribute('aria-invalid', 'true')
    expect(add).toHaveAccessibleDescription('Please add at least 1 chip.')
    expect(add).toHaveFocus()
    expect(api.to('PUT /admin/content/skill-groups/frontend')).toEqual([])

    // Adding a chip clears it.
    await user.click(add)
    expect(within(skills).getByRole('button', { name: 'Add proper noun' })).not.toHaveAttribute('aria-invalid')
  })

  it('puts a 409 on the slug field', async () => {
    mockApi({
      ...signedIn(),
      'GET /admin/content/certifications': ok({ items: certifications() }),
      'POST /admin/content/certifications': failWith(409, 'conflict'),
    })
    const { user } = renderAdmin('/admin/content/certifications/new')
    await user.type(await screen.findByLabelText('Certification'), 'Data Things')
    await user.click(screen.getByRole('button', { name: 'Create entry' }))

    const slug = screen.getByLabelText('Slug')
    await waitFor(() => expect(slug).toHaveAttribute('aria-invalid', 'true'))
    expect(slug).toHaveAccessibleDescription(expect.stringContaining('Another entry already uses this slug.'))
    expect(slug).toHaveFocus()
  })

  it('maps a 422 onto the named controls and shows `body` and unknown keys above the form, all localized', async () => {
    mockApi({
      ...signedIn(),
      'GET /admin/content/experience': ok({ items: experience() }),
      'PUT /admin/content/experience/acme': failWith(422, 'validation_error', {
        fields: {
          'translations.en.role': 'String should have at most 200 characters',
          'translations.zh-Hant.bullets.1': 'String should have at least 1 character',
          'tech.1.str': 'Input should be a valid string',
          body: 'Value error, end must not be earlier than start',
          'translations.fr': 'Extra inputs are not permitted',
        },
      }),
    })
    const { user } = renderAdmin('/admin/content/experience/acme')
    await findPageHeading('Edit “Lead Developer · Acme Corp”')
    await user.click(await screen.findByRole('button', { name: 'Save changes' }))

    const summaryBox = await formErrorBox()
    expect(summaryBox).toHaveTextContent('The server rejected the entry as a whole. Please check that the fields agree with each other.')
    // A key that matches no control is named, as code, after a localized sentence.
    expect(summaryBox).toHaveTextContent('The server rejected a field that this form does not show: translations.fr')
    expect(within(summaryBox).getByText('translations.fr').tagName).toBe('CODE')
    expect(summaryBox).toHaveFocus()

    const role = inGroup('Role', 'English')
    expect(role).toHaveAttribute('aria-invalid', 'true')
    expect(role).toHaveAccessibleDescription('The server rejected this value.')
    expect(inGroup('Role', 'Traditional Chinese')).not.toHaveAttribute('aria-invalid')
    const bullet = inGroup('bullet 2', 'Traditional Chinese', group('Bullet points'))
    expect(bullet).toHaveAttribute('aria-invalid', 'true')
    expect(bullet).toHaveAccessibleDescription('The server rejected this value.')
    // `tech.1.str` (a union validator's path) lands on chip 2, a translated term: its first control.
    const chip = inGroup('chip 2', 'English', group('Technologies (optional)'))
    expect(chip).toHaveAccessibleDescription('The server rejected this value.')
    expect(statusRegion()).toHaveTextContent('Not saved. Please check the highlighted fields.')
    // The server's own sentences are for developers: none of them reaches the page.
    for (const text of ['String should have', 'Input should be', 'Value error', 'Extra inputs']) {
      expect(document.body).not.toHaveTextContent(text)
    }

    // A corrected field drops its message at once.
    await user.type(role, '!')
    expect(role).not.toHaveAttribute('aria-invalid')
  })

  it('keeps the changes when the entry was saved elsewhere (412), and can load the latest version instead', async () => {
    const [cloud, pm] = certifications()
    const revised: CertificationItem = { ...pm, name: 'Project Management 202 (revised)', updatedAt: '2026-09-22T08:00:00Z' }
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/certifications': sequence(ok({ items: [cloud, pm] }), ok({ items: [cloud, revised] })),
      'PUT /admin/content/certifications/pm202': sequence(failWith(412, 'precondition_failed'), echo()),
    })
    const { user } = renderAdmin('/admin/content/certifications/pm202')
    const name = await screen.findByLabelText('Certification')
    await user.clear(name)
    await user.type(name, 'My version')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const box = await formErrorBox()
    expect(box).toHaveTextContent(
      'This entry was changed elsewhere since you opened it. Reload it to see the latest version; your changes are kept in this tab until you leave.',
    )
    expect(box).toHaveFocus()
    expect(ifMatch(api.to('PUT /admin/content/certifications/pm202')[0])).toBe(`"${pm.updatedAt}"`)
    // Nothing was saved, nothing is lost: the form and the tab keep the changes.
    expect(name).toHaveValue('My version')
    expect(sessionStorage.getItem('admin:draft:certifications/pm202')).not.toBeNull()

    // Loading the latest version drops the changes, after a confirmation.
    await user.click(within(box).getByRole('button', { name: 'Load latest version' }))
    let dialog = screen.getByRole('dialog', { name: 'Load the latest version?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(name).toHaveValue('My version')
    await user.click(within(box).getByRole('button', { name: 'Load latest version' }))
    dialog = screen.getByRole('dialog', { name: 'Load the latest version?' })
    await user.click(within(dialog).getByRole('button', { name: 'Discard and load' }))

    await waitFor(() => expect(screen.getByLabelText('Certification')).toHaveValue('Project Management 202 (revised)'))
    expect(statusRegion()).toHaveTextContent('The latest version is shown. Your changes were discarded.')
    expect(screen.queryByText('The entry was not saved:')).toBeNull()
    expect(sessionStorage.getItem('admin:draft:certifications/pm202')).toBeNull()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Edit “Project Management 202 (revised)”')
    await waitFor(() => expect(heading).toHaveFocus())

    // The next save matches the version just loaded.
    await user.type(screen.getByLabelText('Certification'), '!')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await findPageHeading('Certifications')
    expect(ifMatch(api.to('PUT /admin/content/certifications/pm202')[1])).toBe(`"${revised.updatedAt}"`)
  })

  it('says so when an entry is too large to save (413)', async () => {
    mockApi({
      ...signedIn(),
      'GET /admin/content/certifications': ok({ items: certifications() }),
      'PUT /admin/content/certifications/pm202': failWith(413, 'payload_too_large'),
    })
    const { user } = renderAdmin('/admin/content/certifications/pm202')
    await user.type(await screen.findByLabelText('Certification'), '!')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await formErrorBox()).toHaveTextContent('This entry is too large to save. Please shorten it.')
    expect(screen.getByLabelText('Certification')).toHaveValue('Project Management 202!')
  })

  it('keeps typing made while a save was on its way, on the version just saved', async () => {
    const [cloud, pm] = certifications()
    const pending = deferred()
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/certifications': ok({ items: [cloud, pm] }),
      'PUT /admin/content/certifications/pm202': sequence(pending.handler, echo()),
    })
    const { user } = renderAdmin('/admin/content/certifications/pm202')
    const name = await screen.findByLabelText('Certification')
    await user.clear(name)
    await user.type(name, 'Saved name')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-disabled', 'true')

    // Typed while the save is on its way.
    await user.type(name, ' and more')
    pending.resolve(jsonResponse({ ...pm, name: 'Saved name', updatedAt: '2026-09-23T09:00:00Z' }))

    await waitFor(() =>
      expect(statusRegion()).toHaveTextContent('Saved “Saved name”. You have newer changes that are not saved yet.'),
    )
    // Still on the form, on the saved version, with the newer typing and the focus where they were.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Edit “Saved name”')
    expect(name).toHaveValue('Saved name and more')
    expect(name).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Save changes' })).not.toHaveAttribute('aria-disabled')
    expect(JSON.parse(sessionStorage.getItem('admin:draft:certifications/pm202')!)).toMatchObject({
      base: '2026-09-23T09:00:00Z',
      draft: { name: 'Saved name and more' },
    })

    // The newer changes save on top of the version just saved.
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await findPageHeading('Certifications')
    const [, second] = api.to('PUT /admin/content/certifications/pm202')
    expect(second.json).toMatchObject({ name: 'Saved name and more' })
    expect(ifMatch(second)).toBe('"2026-09-23T09:00:00Z"')
    expect(sessionStorage.length).toBe(0)
  })

  it('takes typing made while a new entry was being created to its edit page', async () => {
    const created: CertificationItem = { slug: 'data-things', sortOrder: 2, name: 'Data Things', inProgress: false, updatedAt: UPDATED }
    const pending = deferred()
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/certifications': sequence(
        ok({ items: certifications() }),
        ok({ items: [...certifications(), created] }),
      ),
      'POST /admin/content/certifications': pending.handler,
    })
    const { user } = renderAdmin('/admin/content/certifications/new')
    await user.type(await screen.findByLabelText('Certification'), 'Data Things')
    await user.click(screen.getByRole('button', { name: 'Create entry' }))
    await user.click(screen.getByLabelText('In progress'))
    pending.resolve(jsonResponse(created, { status: 201 }))

    // The entry exists now: the typing goes on on its own page (the create form would post it twice).
    expect(await findPageHeading('Edit “Data Things”')).toBeInTheDocument()
    await waitFor(() => expect(navigation.location?.pathname).toBe('/admin/content/certifications/data-things'))
    expect(statusRegion()).toHaveTextContent('Saved “Data Things”. You have newer changes that are not saved yet.')
    expect(await screen.findByLabelText('In progress')).toBeChecked()
    expect(screen.getByText('Your unsaved changes from before have been restored.')).toBeInTheDocument()
    expect(sessionStorage.getItem('admin:draft:certifications/new')).toBeNull()
    expect(api.to('POST /admin/content/certifications')).toHaveLength(1)
  })

  it('edits chips: reorder, switch between proper noun and translated term, add and remove', async () => {
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/skill-groups': ok({ items: skillGroups() }),
      'PUT /admin/content/skill-groups/frontend': echo(),
    })
    const { user } = renderAdmin('/admin/content/skill-groups/frontend')
    await findPageHeading('Edit “Front-end”')
    const skills = await screen.findByRole('group', { name: 'Skills' })
    expect(inGroup('chip 1', 'Text', skills)).toHaveValue('React')
    expect(inGroup('chip 2', 'English', skills)).toHaveValue('Responsive UI')

    await user.click(within(skills).getByRole('button', { name: 'Move chip 2 up' }))
    expect(statusRegion()).toHaveTextContent('Moved to position 1 of 2.')
    expect(within(skills).getByRole('button', { name: 'Move chip 1 up' })).toHaveFocus()
    expect(inGroup('chip 1', 'English', skills)).toHaveValue('Responsive UI')

    // React becomes a translated term, keeping its text as the English version.
    await user.click(inGroup('chip 2', 'Translated term', skills))
    expect(inGroup('chip 2', 'English', skills)).toHaveValue('React')
    await user.type(inGroup('chip 2', 'Traditional Chinese', skills), '回應')

    await user.click(within(skills).getByRole('button', { name: 'Add proper noun' }))
    await user.keyboard('Vue')
    await user.click(within(skills).getByRole('button', { name: 'Remove chip 1' }))
    expect(statusRegion()).toHaveTextContent('Removed chip 1.')
    expect(within(skills).getByRole('button', { name: 'Remove chip 1' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await findPageHeading('Skill groups')
    expect(api.to('PUT /admin/content/skill-groups/frontend')[0].json).toEqual({
      slug: 'frontend',
      items: [{ en: 'React', 'zh-Hant': '回應' }, 'Vue'],
      translations: { en: { label: 'Front-end' }, 'zh-Hant': { label: '前端' } },
    })
  })

  it('keeps both locales of the bullets in step when rows are added, moved and removed', async () => {
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/experience': ok({ items: experience() }),
      'PUT /admin/content/experience/acme': echo(),
    })
    const { user } = renderAdmin('/admin/content/experience/acme')
    await findPageHeading('Edit “Lead Developer · Acme Corp”')
    const bullets = await screen.findByRole('group', { name: 'Bullet points' })

    await user.click(within(bullets).getByRole('button', { name: 'Add bullet' }))
    expect(inGroup('bullet 3', 'English', bullets)).toHaveFocus()
    await user.keyboard('Hired.')
    await user.type(inGroup('bullet 3', 'Traditional Chinese', bullets), '招聘。')

    await user.click(within(bullets).getByRole('button', { name: 'Move bullet 3 up' }))
    expect(statusRegion()).toHaveTextContent('Moved to position 2 of 3.')
    expect(within(bullets).getByRole('button', { name: 'Move bullet 2 up' })).toHaveFocus()

    await user.click(within(bullets).getByRole('button', { name: 'Remove bullet 1' }))
    expect(statusRegion()).toHaveTextContent('Removed bullet 1.')
    await user.click(within(bullets).getByRole('button', { name: 'Remove bullet 1' }))
    // One bullet left: it cannot be removed.
    expect(within(bullets).getByRole('button', { name: 'Remove bullet 1' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(within(bullets).getByRole('button', { name: 'Remove bullet 1' }))

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await findPageHeading('Experience')
    const sent = api.to('PUT /admin/content/experience/acme')[0].json as ExperienceItem
    expect(sent.translations.en.bullets).toEqual(['Led the team.'])
    expect(sent.translations['zh-Hant'].bullets).toEqual(['帶領團隊。'])
    expect(sent.tech).toEqual(['React', { en: 'Data pipelines', 'zh-Hant': '數據管道' }])
    expect(sent.end).toBeNull()
  })

  it('asks before leaving unsaved changes, in the app and for the browser', async () => {
    mockApi({ ...signedIn(), 'GET /admin/content/certifications': ok({ items: certifications() }) })
    const { user } = renderAdmin('/admin/content/certifications/pm202')
    await findPageHeading('Edit “Project Management 202”')
    await user.type(await screen.findByLabelText('Certification'), ' v2')

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)

    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    let dialog = screen.getByRole('dialog', { name: 'Leave without saving?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Edit “Project Management 202”' })).toBeInTheDocument()
    expect(screen.getByLabelText('Certification')).toHaveValue('Project Management 202 v2')

    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    dialog = screen.getByRole('dialog', { name: 'Leave without saving?' })
    await user.click(within(dialog).getByRole('button', { name: 'Leave page' }))
    const dashboard = await findPageHeading('Dashboard')
    await waitFor(() => expect(dashboard).toHaveFocus())

    // Nothing unsaved any more: no prompt from the browser either.
    const later = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(later)
    expect(later.defaultPrevented).toBe(false)
  })

  it('keeps the changes, their kept draft and the guard when signing out fails; forgets them once it works', async () => {
    mockApi({
      ...signedIn(),
      'GET /admin/content/certifications': ok({ items: certifications() }),
      'POST /auth/logout': sequence(failWith(503, 'service_unavailable'), noContent),
    })
    const { user } = renderAdmin('/admin/content/certifications/pm202')
    await user.type(await screen.findByLabelText('Certification'), ' v2')
    const leaveDialog = () => screen.getByRole('dialog', { name: 'Leave without saving?' })

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await user.click(within(leaveDialog()).getByRole('button', { name: 'Leave page' }))
    await waitFor(() =>
      expect(statusRegion()).toHaveTextContent('You could not be signed out. Check your connection and try again.'),
    )
    // Still here, changes and kept draft included.
    expect(screen.getByLabelText('Certification')).toHaveValue('Project Management 202 v2')
    expect(sessionStorage.getItem('admin:draft:certifications/pm202')).not.toBeNull()
    // Still guarded: leaving asks again, and so does the browser.
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    await user.click(within(leaveDialog()).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Edit “Project Management 202”' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await user.click(within(leaveDialog()).getByRole('button', { name: 'Leave page' }))
    expect(await findPageHeading('Sign in')).toBeInTheDocument()
    expect(screen.getByText('You have signed out.')).toBeInTheDocument()
    expect(sessionStorage.getItem('admin:draft:certifications/pm202')).toBeNull()
  })

  it('keeps the draft through an expired session and brings it back after signing in', async () => {
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/certifications': ok({ items: certifications() }),
      'PUT /admin/content/certifications/pm202': sequence(failWith(401, 'unauthorized'), echo()),
      'POST /auth/login': ok(loginResult()),
    })
    const { user } = renderAdmin('/admin/content/certifications/pm202')
    const name = await screen.findByLabelText('Certification')
    await user.clear(name)
    await user.type(name, 'Project Management 303')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await findPageHeading('Sign in')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email'), ADMIN_EMAIL)
    await user.type(screen.getByLabelText('Password'), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await findPageHeading('Edit “Project Management 202”')
    expect(await screen.findByLabelText('Certification')).toHaveValue('Project Management 303')
    expect(screen.getByText('Your unsaved changes from before have been restored.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await findPageHeading('Certifications')
    expect(api.to('PUT /admin/content/certifications/pm202')[1].json).toMatchObject({ name: 'Project Management 303' })
    // Saved: nothing is kept any more.
    expect(sessionStorage.length).toBe(0)
  })

  it('lets a restored draft be discarded, and forgets a draft the user chose to leave', async () => {
    const [, pm] = certifications()
    writeDraft('certifications/pm202', { slug: 'pm202', name: 'Draft name', inProgress: true }, pm.updatedAt)
    mockApi({ ...signedIn(), 'GET /admin/content/certifications': ok({ items: [pm] }) })
    const { user } = renderAdmin('/admin/content/certifications/pm202')

    expect(await screen.findByLabelText('Certification')).toHaveValue('Draft name')
    expect(screen.getByText('Your unsaved changes from before have been restored.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard them' }))
    expect(screen.getByLabelText('Certification')).toHaveValue('Project Management 202')
    expect(screen.queryByText('Your unsaved changes from before have been restored.')).toBeNull()
    expect(statusRegion()).toHaveTextContent('Restored changes discarded: the saved version is shown.')
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect(sessionStorage.getItem('admin:draft:certifications/pm202')).toBeNull()

    await user.type(screen.getByLabelText('Certification'), '!')
    expect(sessionStorage.getItem('admin:draft:certifications/pm202')).not.toBeNull()
    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave page' }))
    await findPageHeading('Dashboard')
    expect(sessionStorage.getItem('admin:draft:certifications/pm202')).toBeNull()
  })

  it('offers nothing back when a kept draft has the saved content in another key order', async () => {
    const [, pm] = certifications()
    writeDraft('certifications/pm202', { inProgress: pm.inProgress, name: pm.name, slug: pm.slug }, pm.updatedAt)
    mockApi({ ...signedIn(), 'GET /admin/content/certifications': ok({ items: [pm] }) })
    renderAdmin('/admin/content/certifications/pm202')
    expect(await screen.findByLabelText('Certification')).toHaveValue('Project Management 202')
    expect(screen.queryByText('Your unsaved changes from before have been restored.')).toBeNull()
    // Nothing unsaved: no prompt from the browser.
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
  })

  it('warns when a restored draft started from an older version of the row', async () => {
    const [, pm] = certifications()
    writeDraft('certifications/pm202', { slug: 'pm202', name: 'Old draft', inProgress: true }, '2026-01-01T00:00:00Z')
    mockApi({ ...signedIn(), 'GET /admin/content/certifications': ok({ items: [pm] }) })
    renderAdmin('/admin/content/certifications/pm202')
    expect(await screen.findByLabelText('Certification')).toHaveValue('Old draft')
    expect(screen.getByText(/this entry has been saved elsewhere since then/)).toBeInTheDocument()
  })

  it('shows a not-found message for a row that does not exist', async () => {
    mockApi({ ...signedIn(), 'GET /admin/content/certifications': ok({ items: certifications() }) })
    renderAdmin('/admin/content/certifications/ghost')
    expect(await findPageHeading('Entry not found')).toBeInTheDocument()
    expect(screen.getByText('There is no entry “ghost” in this collection. It may have been deleted.')).toBeInTheDocument()
  })

  it('offers no create form for site texts', async () => {
    mockApi(signedIn())
    renderAdmin('/admin/content/site-texts/new')
    expect(await findPageHeading('Not found')).toBeInTheDocument()
  })
})
