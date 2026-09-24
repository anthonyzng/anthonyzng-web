import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { jsonResponse } from '../../test/api'
import { cv, signedIn, summary } from '../test/fixtures'
import { failWith, mockApi, ok, sequence } from '../test/mockApi'
import { findPageHeading, renderAdmin, statusRegion } from '../test/renderAdmin'

function sizedFile(name: string, type: string, bytes: number): File {
  const file = new File(['%PDF'], name, { type })
  Object.defineProperty(file, 'size', { value: bytes })
  return file
}

describe('CV page', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
  })

  it('shows the CV that is online, with a download link on the API origin', async () => {
    const api = mockApi({ ...signedIn(), 'GET /admin/cv': ok({ cv: cv() }) })
    renderAdmin('/admin/cv')
    await findPageHeading('CV')

    const current = await screen.findByRole('region', { name: 'Online now' })
    expect(current).toHaveTextContent('resume.pdf')
    expect(current).toHaveTextContent('240 KB')
    expect(within(current).getByRole('link', { name: 'Download resume.pdf' })).toHaveAttribute(
      'href',
      'http://localhost:8000/api/v1/files/cv-1',
    )
    expect(api.to('GET /admin/cv')[0].init?.credentials).toBe('include')
  })

  it('uploads a PDF after checking it here first', async () => {
    const uploaded = { ...cv(), filename: 'cv-2026.pdf', size: 3 * 1024 * 1024, url: '/api/v1/files/cv-2' }
    const api = mockApi({
      ...signedIn(),
      'GET /admin/cv': ok({ cv: null }),
      'PUT /admin/cv': ok({ cv: uploaded }),
    })
    const { user } = renderAdmin('/admin/cv')
    await findPageHeading('CV')
    expect(await screen.findByText('No CV uploaded yet.')).toBeInTheDocument()
    const input = screen.getByLabelText('Upload a CV')
    expect(input).toHaveAttribute('accept', 'application/pdf,.pdf')

    await user.upload(input, new File(['png'], 'photo.png', { type: 'image/png' }))
    expect(input).toHaveAccessibleDescription(expect.stringContaining('Please choose a PDF file.'))
    await user.upload(input, sizedFile('huge.pdf', 'application/pdf', 11 * 1024 * 1024))
    expect(input).toHaveAccessibleDescription(expect.stringContaining('The file is larger than 10 MB.'))
    expect(api.to('PUT /admin/cv')).toEqual([])

    // A .pdf the system reports without a type is still accepted; the server checks the content.
    const file = sizedFile('cv-2026.pdf', '', 3 * 1024 * 1024)
    await user.upload(input, file)
    await waitFor(() => expect(statusRegion()).toHaveTextContent('CV uploaded.'))
    const [put] = api.to('PUT /admin/cv')
    expect(put.form?.get('file')).toBe(file)
    expect(put.init?.headers).toBeUndefined()
    const current = screen.getByRole('region', { name: 'Online now' })
    expect(current).toHaveTextContent('cv-2026.pdf')
    expect(current).toHaveTextContent('3 MB')
    expect(screen.getByLabelText('Replace the CV')).toBe(input)
    // The dashboard's "CV online" tile is refreshed after the change.
    await waitFor(() => expect(api.to('GET /admin/summary').length).toBeGreaterThanOrEqual(2))
  })

  it('refreshes the summary after a change even when an older request is still running', async () => {
    let answer!: (response: Response) => void
    const api = mockApi({
      ...signedIn(),
      'GET /admin/summary': sequence(
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve
          }),
        ok(summary({ cv: null })),
      ),
      'GET /admin/cv': ok({ cv: cv() }),
      'DELETE /admin/cv': ok({ cv: null }),
    })
    const { user } = renderAdmin('/admin/cv')
    await user.click(await screen.findByRole('button', { name: 'Remove CV' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('No CV uploaded yet.')).toBeInTheDocument()
    expect(api.to('GET /admin/summary')).toHaveLength(1) // the first one is still running

    answer(jsonResponse(summary()))
    await waitFor(() => expect(api.to('GET /admin/summary')).toHaveLength(2))
  })

  it('takes one upload at a time: a pick while one is on its way is refused, and the first one goes on', async () => {
    const first = new File(['%PDF'], 'first.pdf', { type: 'application/pdf' })
    let answer: (response: Response) => void = () => {}
    const api = mockApi({
      ...signedIn(),
      'GET /admin/cv': ok({ cv: null }),
      'PUT /admin/cv': sequence(
        () => new Promise<Response>((resolve) => (answer = resolve)),
        ok({ cv: { ...cv(), filename: 'third.pdf' } }),
      ),
    })
    const { user } = renderAdmin('/admin/cv')
    const input = await screen.findByLabelText('Upload a CV')
    const field = input.parentElement!
    await user.upload(input, first)
    expect(within(field).getByText('Uploading…')).toBeInTheDocument()

    // Aborting the first would not stop the server, which could then store it after the second.
    const busy = 'Wait until the current CV is uploaded, then choose again.'
    await user.upload(input, new File(['%PDF'], 'second.pdf', { type: 'application/pdf' }))
    expect(statusRegion()).toHaveTextContent(busy)
    await user.upload(input, new File(['png'], 'photo.png', { type: 'image/png' }))
    expect(api.to('PUT /admin/cv')).toHaveLength(1)
    expect(api.to('PUT /admin/cv')[0].init?.signal?.aborted).toBe(false)

    answer(jsonResponse({ cv: { ...cv(), filename: 'first.pdf' } }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Online now' })).toHaveTextContent('first.pdf'))
    expect(statusRegion()).toHaveTextContent('CV uploaded.')
    expect(within(field).queryByText('Uploading…')).toBeNull()

    // Once it is done, the next pick goes through.
    await user.upload(input, new File(['%PDF'], 'third.pdf', { type: 'application/pdf' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Online now' })).toHaveTextContent('third.pdf'))
    expect(api.to('PUT /admin/cv')).toHaveLength(2)
  })

  it('shows its own message for each reason the server gives, and clears it once an upload works', async () => {
    mockApi({
      ...signedIn(),
      'GET /admin/cv': ok({ cv: null }),
      'PUT /admin/cv': sequence(
        failWith(422, 'file_type', { fields: { file: 'Upload a PDF file.' } }),
        failWith(422, 'file_empty', { fields: { file: 'The file is empty.' } }),
        failWith(422, 'file_missing', { fields: { file: 'Choose a file to upload.' } }),
        failWith(422, 'image_unreadable', { fields: { file: 'The file is not a readable image.' } }),
        ok({ cv: cv() }),
      ),
    })
    const { user } = renderAdmin('/admin/cv')
    const input = await screen.findByLabelText('Upload a CV')
    for (const message of [
      'The file is not a valid PDF. Please export it again and upload the new file.',
      'The file is empty. Please choose another one.',
      'The file did not reach the server. Please choose it again.',
      // A code the CV has no message for: the generic refusal, never the server's sentence.
      'The server could not use this file.',
    ]) {
      await user.upload(input, new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
      await waitFor(() => expect(input).toHaveAccessibleDescription(expect.stringContaining(message)))
    }
    expect(document.body).not.toHaveTextContent('Choose a file to upload.')
    expect(document.body).not.toHaveTextContent('readable image')

    await user.upload(input, new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
    await waitFor(() => expect(statusRegion()).toHaveTextContent('CV uploaded.'))
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).toHaveAccessibleDescription('A PDF up to 10 MB. It replaces the current file at once.')
  })

  it('reports a file the server refuses as too large', async () => {
    mockApi({ ...signedIn(), 'GET /admin/cv': ok({ cv: null }), 'PUT /admin/cv': failWith(413, 'payload_too_large') })
    const { user } = renderAdmin('/admin/cv')
    const input = await screen.findByLabelText('Upload a CV')
    await user.upload(input, new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
    await waitFor(() => expect(input).toHaveAccessibleDescription(expect.stringContaining('The file is larger than 10 MB.')))
    expect(statusRegion()).toHaveTextContent('The CV was not uploaded.')
  })

  it('offers a retry when the CV cannot be loaded, and says when it worked', async () => {
    mockApi({ ...signedIn(), 'GET /admin/cv': sequence(failWith(500, 'internal_error'), ok({ cv: cv() })) })
    const { user } = renderAdmin('/admin/cv')
    expect(await screen.findByRole('alert')).toHaveTextContent('This could not be loaded.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('heading', { level: 1, name: 'CV' })).toHaveFocus()
    expect(await screen.findByRole('region', { name: 'Online now' })).toHaveTextContent('resume.pdf')
    expect(statusRegion()).toHaveTextContent('Loaded.')
  })

  it('removes the CV after confirmation', async () => {
    const api = mockApi({ ...signedIn(), 'GET /admin/cv': ok({ cv: cv() }), 'DELETE /admin/cv': ok({ cv: null }) })
    const { user } = renderAdmin('/admin/cv')
    const remove = await screen.findByRole('button', { name: 'Remove CV' })

    await user.click(remove)
    const dialog = screen.getByRole('dialog', { name: 'Remove the CV?' })
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('No CV uploaded yet.')).toBeInTheDocument()
    expect(statusRegion()).toHaveTextContent('CV removed.')
    expect(api.to('DELETE /admin/cv')).toHaveLength(1)
    await waitFor(() => expect(screen.getByLabelText('Upload a CV')).toHaveFocus())
  })
})
