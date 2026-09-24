import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { projects, signedIn } from '../test/fixtures'
import { failWith, mockApi, ok, sequence, type ApiCall } from '../test/mockApi'
import { findPageHeading, renderAdmin, statusRegion } from '../test/renderAdmin'

const IMAGE = { url: '/api/v1/files/img-1', width: 1600, height: 900 }
const cover = () => document.querySelector<HTMLImageElement>('section img')
const PLACEHOLDER_NOTE = 'Save this project as a real project (untick “Placeholder slot”) to add a cover image.'

/** A File whose reported size is `bytes`, without allocating it. */
function sizedFile(name: string, type: string, bytes: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: bytes })
  return file
}

describe('project editor', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
  })

  it('creates a placeholder slot: no copy, link, chips, order or image in the payload', async () => {
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/projects': ok({ items: projects() }),
      'POST /admin/content/projects': (call: ApiCall) =>
        ok({ ...(call.json as object), sortOrder: 2, image: null, updatedAt: '2026-09-23T12:00:00Z' }, 201)(call),
    })
    const { user } = renderAdmin('/admin/content/projects/new')
    await findPageHeading('New entry in Projects')
    const saveFirst = 'Create the project first, then add its cover image here.'
    expect(await screen.findByText(saveFirst)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Title' })).toBeInTheDocument()

    await user.click(screen.getByLabelText('Placeholder slot'))
    expect(screen.queryByRole('group', { name: 'Title' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Summary' })).toBeNull()
    expect(screen.queryByLabelText(/Project link/)).toBeNull()
    // The image section follows the saved row, of which there is none yet.
    expect(screen.getByText(saveFirst)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Slug'), 'slotThree')
    await user.click(screen.getByRole('button', { name: 'Create entry' }))
    await findPageHeading('Projects')
    expect(api.to('POST /admin/content/projects')[0].json).toEqual({
      slug: 'slotThree',
      placeholder: true,
      url: null,
      tech: [],
      translations: { en: { title: null, summary: null }, 'zh-Hant': { title: null, summary: null } },
    })
  })

  it('requires the copy in both languages for a real project and a full web address', async () => {
    const api = mockApi({ ...signedIn(), 'GET /admin/content/projects': ok({ items: projects() }) })
    const { user } = renderAdmin('/admin/content/projects/new')
    await findPageHeading('New entry in Projects')
    const title = within(await screen.findByRole('group', { name: 'Title' }))
    await user.type(title.getByLabelText('English'), 'Blog engine')
    expect(screen.getByLabelText('Slug')).toHaveValue('blog-engine')
    await user.type(screen.getByLabelText('Project link (optional)'), 'https://exa mple.com')
    await user.click(screen.getByRole('button', { name: 'Create entry' }))

    expect(title.getByLabelText('Traditional Chinese')).toHaveAttribute('aria-invalid', 'true')
    expect(title.getByLabelText('Traditional Chinese')).toHaveFocus()
    expect(within(screen.getByRole('group', { name: 'Summary' })).getByLabelText('English')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    // A prefix is not enough: the address must parse, with no space in it.
    expect(screen.getByLabelText('Project link (optional)')).toHaveAccessibleDescription(
      expect.stringContaining('Please enter a full web address starting with https:// (or http://).'),
    )
    expect(api.to('POST /admin/content/projects')).toEqual([])
  })

  it('uploads, replaces and removes the cover image of a saved project', async () => {
    const [shop] = projects()
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/projects': ok({ items: projects() }),
      'PUT /admin/content/projects/shop/image': ok({ ...shop, image: IMAGE }),
      'DELETE /admin/content/projects/shop/image': ok({ ...shop, image: null }),
    })
    const { user } = renderAdmin('/admin/content/projects/shop')
    await findPageHeading('Edit “Web shop”')
    const input = await screen.findByLabelText('Upload an image')
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    expect(screen.getByText('No cover image yet.')).toBeInTheDocument()

    // Checked here first: a wrong type or an oversized file never travels.
    await user.upload(input, new File(['notes'], 'notes.txt', { type: 'text/plain' }))
    expect(input).toHaveAccessibleDescription(expect.stringContaining('Please choose a JPEG, PNG or WebP image.'))
    await user.upload(input, sizedFile('huge.png', 'image/png', 9 * 1024 * 1024))
    expect(input).toHaveAccessibleDescription(expect.stringContaining('The image is larger than 8 MB.'))
    expect(api.to('PUT /admin/content/projects/shop/image')).toEqual([])

    const file = new File(['png'], 'cover.png', { type: 'image/png' })
    await user.upload(input, file)
    await waitFor(() => expect(cover()).toHaveAttribute('src', 'http://localhost:8000/api/v1/files/img-1'))
    expect(cover()).toHaveAttribute('alt', '')
    expect(cover()).toHaveAttribute('width', '1600')
    expect(statusRegion()).toHaveTextContent('Cover image saved.')
    const [put] = api.to('PUT /admin/content/projects/shop/image')
    expect(put.form?.get('file')).toBe(file)
    expect(put.init?.headers).toBeUndefined() // the browser writes the multipart Content-Type
    expect(put.init?.credentials).toBe('include')
    expect(screen.getByLabelText('Replace the image')).toBe(input)
    expect(input).not.toHaveAttribute('aria-invalid')

    await user.click(screen.getByRole('button', { name: 'Remove image' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove the cover image?' })
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(cover()).toBeNull())
    expect(statusRegion()).toHaveTextContent('Cover image removed.')
    expect(api.to('DELETE /admin/content/projects/shop/image')).toHaveLength(1)
    // The Remove button is gone: focus goes to the file input.
    await waitFor(() => expect(screen.getByLabelText('Upload an image')).toHaveFocus())
  })

  it('shows its own message for each reason the server gives for refusing an image, never the server text', async () => {
    mockApi({
      ...signedIn(),
      'GET /admin/content/projects': ok({ items: projects() }),
      'PUT /admin/content/projects/shop/image': sequence(
        failWith(422, 'image_unreadable', { fields: { file: 'The file is not a readable image.' } }),
        failWith(422, 'image_too_many_pixels', { fields: { file: 'The image is too large (40 megapixels at most).' } }),
        failWith(422, 'file_empty', { fields: { file: 'The file is empty.' } }),
        failWith(422, 'a_future_code', { fields: { file: 'Some reason added later.' } }),
        failWith(413, 'payload_too_large'),
      ),
    })
    const { user } = renderAdmin('/admin/content/projects/shop')
    const input = await screen.findByLabelText('Upload an image')
    for (const message of [
      'The file could not be read as an image. Please choose another one.',
      'The image has too many pixels (40 megapixels at most).',
      'The file is empty. Please choose another one.',
      'The server could not use this file.',
      'The image is larger than 8 MB.',
    ]) {
      await user.upload(input, new File(['?'], 'picture.png', { type: 'image/png' }))
      await waitFor(() => expect(input).toHaveAccessibleDescription(expect.stringContaining(message)))
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(statusRegion()).toHaveTextContent('The cover image was not saved.')
    }
    for (const text of ['readable image', 'The image is too large', 'Some reason added later']) {
      expect(document.body).not.toHaveTextContent(text)
    }
  })

  it('takes only the image from an upload that lands after the latest version was loaded', async () => {
    const [shop] = projects()
    const revised = { ...shop, url: 'https://example.com/revised', updatedAt: '2026-09-23T15:00:00Z' }
    let answer: (response: Response) => void = () => {}
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/projects': sequence(ok({ items: [shop] }), ok({ items: [revised] })),
      'PUT /admin/content/projects/shop': sequence(failWith(412, 'precondition_failed'), (call: ApiCall) =>
        ok({ ...(call.json as object), sortOrder: 0, image: IMAGE, updatedAt: '2026-09-23T16:00:00Z' })(call),
      ),
      'PUT /admin/content/projects/shop/image': () => new Promise<Response>((resolve) => (answer = resolve)),
    })
    const { user } = renderAdmin('/admin/content/projects/shop')
    const link = await screen.findByLabelText('Project link (optional)')
    await user.clear(link)
    await user.type(link, 'https://example.com/mine')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    const box = (await screen.findByText('The entry was not saved:')).parentElement!

    await user.upload(screen.getByLabelText('Upload an image'), new File(['png'], 'cover.png', { type: 'image/png' }))
    await user.click(within(box).getByRole('button', { name: 'Load latest version' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard and load' }))
    await waitFor(() => expect(link).toHaveValue('https://example.com/revised'))

    // The upload's answer was made from the row as it was when it was picked (the version before).
    answer(new Response(JSON.stringify({ ...shop, image: IMAGE }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    await waitFor(() => expect(cover()).not.toBeNull())
    expect(link).toHaveValue('https://example.com/revised')
    await user.type(link, '/x')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await findPageHeading('Projects')
    const [, put] = api.to('PUT /admin/content/projects/shop')
    expect(new Headers(put.init?.headers).get('If-Match')).toBe(`"${revised.updatedAt}"`)
  })

  it('offers no upload for a saved placeholder, whatever the unsaved checkbox says', async () => {
    mockApi({ ...signedIn(), 'GET /admin/content/projects': ok({ items: projects() }) })
    const { user } = renderAdmin('/admin/content/projects/slotTwo')
    await findPageHeading('Edit “Placeholder slot (slotTwo)”')
    expect(await screen.findByText(PLACEHOLDER_NOTE)).toBeInTheDocument()
    expect(screen.queryByLabelText('Upload an image')).toBeNull()

    // Unticked but not saved yet: the server would still refuse an image.
    await user.click(screen.getByLabelText('Placeholder slot'))
    expect(screen.getByRole('group', { name: 'Title' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Upload an image')).toBeNull()
    expect(screen.getByText(PLACEHOLDER_NOTE)).toBeInTheDocument()
  })

  it('keeps the image section while a project becomes a placeholder: the image can be removed, which lifts the block', async () => {
    const [shop] = projects()
    const api = mockApi({
      ...signedIn(),
      'GET /admin/content/projects': ok({ items: [{ ...shop, image: IMAGE }] }),
      'DELETE /admin/content/projects/shop/image': ok({ ...shop, image: null, updatedAt: '2026-09-23T12:00:00Z' }),
      'PUT /admin/content/projects/shop': (call: ApiCall) =>
        ok({ ...(call.json as object), sortOrder: 0, image: null, updatedAt: '2026-09-23T13:00:00Z' })(call),
    })
    const { user } = renderAdmin('/admin/content/projects/shop')
    await findPageHeading('Edit “Web shop”')
    await user.click(await screen.findByLabelText('Placeholder slot'))
    expect(cover()).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    const placeholder = screen.getByLabelText('Placeholder slot')
    expect(placeholder).toHaveAttribute('aria-invalid', 'true')
    expect(placeholder).toHaveAccessibleDescription(
      expect.stringContaining('A placeholder has no cover image. Remove the image below first.'),
    )
    expect(api.to('PUT /admin/content/projects/shop')).toEqual([])

    // The section stays through the removal (its dialog with it), and the block goes with the image.
    await user.click(screen.getByRole('button', { name: 'Remove image' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove the cover image?' })
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(cover()).toBeNull())
    expect(screen.getByRole('region', { name: 'Cover image' })).toBeInTheDocument()
    expect(dialog).not.toHaveAttribute('open')
    await waitFor(() => expect(screen.getByLabelText('Upload an image')).toHaveFocus())
    expect(placeholder).not.toHaveAttribute('aria-invalid')

    // Only the image is taken from the removal's answer: the save still names the version the edit
    // started from, so a change saved elsewhere meanwhile (the newer updatedAt above) is refused.
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await findPageHeading('Projects')
    const [put] = api.to('PUT /admin/content/projects/shop')
    expect(put.json).toMatchObject({ placeholder: true, url: null, tech: [] })
    expect(new Headers(put.init?.headers).get('If-Match')).toBe(`"${shop.updatedAt}"`)
  })
})
