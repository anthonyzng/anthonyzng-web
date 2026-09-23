import { describe, expect, it } from 'vitest'
import { resolveStaticContent } from '../content/resolved'
import i18n from '../i18n'
import { contentPayloadSchema } from './schemas'

const base = () => resolveStaticContent(i18n.getFixedT('en'), 'en')
const REAL_PROJECT = {
  id: 'demo',
  placeholder: false,
  title: 'Demo project',
  summary: 'What it does.',
  tech: ['React'],
  url: 'https://example.com/demo',
}
const withProject = (url: string) => ({ ...base(), projects: [{ ...REAL_PROJECT, url }] })

/** The rules the static content never exercises: a real project's link and the shape guards. */
describe('contentPayloadSchema', () => {
  it('accepts a real project with an http(s) link', () => {
    for (const url of ['https://example.com/demo', 'http://localhost:3000/app?x=1#top']) {
      expect(contentPayloadSchema.safeParse(withProject(url)).success, url).toBe(true)
    }
  })

  it('rejects a project link that is not an absolute http(s) URL', () => {
    for (const url of ['ftp://example.com/x', 'javascript:alert(1)', 'mailto:someone@example.com', 'example.com', '/relative']) {
      expect(contentPayloadSchema.safeParse(withProject(url)).success, url).toBe(false)
    }
  })

  it('rejects a month that is not YYYY-MM and an empty id', () => {
    const content = base()
    const [first, ...rest] = content.experience
    expect(contentPayloadSchema.safeParse({ ...content, experience: [{ ...first, start: '2023-13' }, ...rest] }).success).toBe(false)
    expect(contentPayloadSchema.safeParse({ ...content, experience: [{ ...first, end: 'Nov 2023' }, ...rest] }).success).toBe(false)
    expect(contentPayloadSchema.safeParse({ ...content, experience: [{ ...first, id: '' }, ...rest] }).success).toBe(false)
  })

  it('ignores keys the server may add later and rejects an unknown locale', () => {
    const parsed = contentPayloadSchema.safeParse({ ...base(), addedLater: true })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect('addedLater' in parsed.data).toBe(false)
    expect(contentPayloadSchema.safeParse({ ...base(), locale: 'fr' }).success).toBe(false)
  })
})
