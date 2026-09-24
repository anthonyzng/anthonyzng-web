import { describe, expect, it } from 'vitest'
import { staticContent } from '../content/staticContent'
import { contentPayloadSchema } from './schemas'

const base = () => structuredClone(staticContent('en'))
const REAL_PROJECT = {
  id: 'demo',
  placeholder: false,
  title: 'Demo project',
  summary: 'What it does.',
  tech: ['React'],
  url: 'https://example.com/demo',
  image: null,
}
const IMAGE = { url: '/api/v1/files/0b7e7c1e-6f3a-4d2b-9a57-1c1b2f0e9d44', width: 1600, height: 1200 }
const CV = { url: '/api/v1/files/5d0c4b8e-2f7a-4c1d-8e3b-9a6f1e2d3c4b', filename: 'CV.pdf', size: 184_320, updatedAt: '2026-09-23T10:00:00Z' }

const withProject = (project: Partial<typeof REAL_PROJECT> | Record<string, unknown>) => ({
  ...base(),
  projects: [{ ...REAL_PROJECT, ...project }],
})
const accepts = (payload: unknown) => contentPayloadSchema.safeParse(payload).success

/** The rules the saved content never exercises: links, images, the CV and the shape guards. */
describe('contentPayloadSchema', () => {
  it('accepts the content the tests render', () => {
    expect(accepts(base())).toBe(true)
  })

  it('accepts a real project with an http(s) link', () => {
    for (const url of ['https://example.com/demo', 'http://localhost:3000/app?x=1#top']) {
      const parsed = contentPayloadSchema.safeParse(withProject({ url }))
      expect(parsed.success, url).toBe(true)
      expect(parsed.data?.projects[0].url).toBe(url)
    }
  })

  it('drops a project link that is not a parseable http(s) URL, keeping the payload', () => {
    const bad = [
      'ftp://example.com/x',
      'javascript:alert(1)',
      'mailto:someone@example.com',
      'example.com',
      '/relative',
      'https://my site.com',
      'https://',
      'https://example.com:99999/',
    ]
    for (const url of bad) {
      const parsed = contentPayloadSchema.safeParse(withProject({ url }))
      expect(parsed.success, url).toBe(true)
      expect(parsed.data?.projects[0].url, url).toBeNull()
    }
  })

  it('accepts a cover image served by the API', () => {
    expect(accepts(withProject({ image: IMAGE }))).toBe(true)
  })

  it('refuses an image that points anywhere but a path on the API origin', () => {
    for (const url of ['https://evil.test/x.webp', '//evil.test/x.webp', 'javascript:alert(1)', 'files/x', '', '/api/v1/files/a b']) {
      expect(accepts(withProject({ image: { ...IMAGE, url } })), url).toBe(false)
    }
    for (const size of [{ width: 0 }, { height: -1 }, { width: 12.5 }]) {
      expect(accepts(withProject({ image: { ...IMAGE, ...size } })), JSON.stringify(size)).toBe(false)
    }
  })

  it('requires the image and cv keys (null when there is none)', () => {
    const { image: _image, ...withoutImage } = REAL_PROJECT
    expect(accepts({ ...base(), projects: [withoutImage] })).toBe(false)
    const { cv: _cv, ...withoutCv } = base()
    expect(accepts(withoutCv)).toBe(false)
  })

  it('accepts the CV and refuses one that points elsewhere or has no name', () => {
    expect(accepts({ ...base(), cv: CV })).toBe(true)
    expect(accepts({ ...base(), cv: { ...CV, url: 'https://evil.test/cv.pdf' } })).toBe(false)
    expect(accepts({ ...base(), cv: { ...CV, filename: '' } })).toBe(false)
    expect(accepts({ ...base(), cv: { ...CV, size: 0 } })).toBe(false)
  })

  it('rejects a month that is not YYYY-MM and an empty id', () => {
    const content = base()
    const [first, ...rest] = content.experience
    expect(accepts({ ...content, experience: [{ ...first, start: '2023-13' }, ...rest] })).toBe(false)
    expect(accepts({ ...content, experience: [{ ...first, end: 'Nov 2023' }, ...rest] })).toBe(false)
    expect(accepts({ ...content, experience: [{ ...first, id: '' }, ...rest] })).toBe(false)
  })

  it('ignores keys the server may add later and rejects an unknown locale', () => {
    const parsed = contentPayloadSchema.safeParse({ ...base(), addedLater: true })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect('addedLater' in parsed.data).toBe(false)
    expect(accepts({ ...base(), locale: 'fr' })).toBe(false)
  })
})
