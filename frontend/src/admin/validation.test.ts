import { describe, expect, it } from 'vitest'
import { getCollection, type Collection } from './collections'
import { setAt, type Draft } from './draft'
import { slugify } from './slugify'
import { errorSlots, mapServerFields, validateDraft } from './validation'

const collection = (id: string): Collection => getCollection(id)!

/** A complete, valid experience draft to break one rule at a time. */
function experienceDraft(): Draft {
  return {
    slug: 'initech',
    company: 'Initech',
    start: '2024-03',
    end: '2024-09',
    tech: ['Go', { en: 'Testing', 'zh-Hant': '測試' }],
    translations: {
      en: { role: 'Engineer', location: 'Austin', bullets: ['Shipped.'] },
      'zh-Hant': { role: '工程師', location: '奧斯汀', bullets: ['交付。'] },
    },
  }
}

const create = { mode: 'create' as const, existingSlugs: ['acme'] }

describe('slugify', () => {
  it.each([
    ['Hong Kong Air Cargo Terminals (HACTL)', 'hong-kong-air-cargo-terminals-hactl'],
    ['Café Déjà Vu', 'cafe-deja-vu'],
    ['  2024 Annual Report!  ', 'annual-report'],
    ['AZ-900', 'az-900'],
    ['數據管道', ''],
    ['a'.repeat(80), 'a'.repeat(64)],
  ])('%s -> %s', (text, slug) => {
    expect(slugify(text)).toBe(slug)
  })

  it('always yields a valid slug or nothing', () => {
    for (const text of ['Ünïcödé   words', '--x--', '9 lives', 'Mixed_Case-Name']) {
      const slug = slugify(text)
      if (slug !== '') expect(slug).toMatch(/^[a-z][a-zA-Z0-9_-]{0,63}$/)
    }
  })
})

describe('validateDraft', () => {
  it('accepts a complete entry', () => {
    expect(validateDraft(collection('experience'), experienceDraft(), create)).toEqual({})
  })

  it('checks the slug on create only, trimmed like the payload', () => {
    const rules = (slug: string) => validateDraft(collection('experience'), setAt(experienceDraft(), 'slug', slug), create).slug
    expect(rules('')).toEqual({ key: 'required' })
    expect(rules('  ')).toEqual({ key: 'required' })
    expect(rules(' my-project ')).toBeUndefined()
    expect(rules('Bad slug')).toEqual({ key: 'slugPattern' })
    expect(rules('new')).toEqual({ key: 'slugReserved', values: { slug: 'new' } })
    expect(rules('acme')).toEqual({ key: 'slugTaken' })
    const edit = validateDraft(collection('experience'), setAt(experienceDraft(), 'slug', 'acme'), {
      mode: 'edit',
      existingSlugs: ['acme'],
    })
    expect(edit.slug).toBeUndefined()
  })

  it('checks months, the end against the start, and the current role', () => {
    const errors = (path: string, value: string | null) =>
      validateDraft(collection('experience'), setAt(experienceDraft(), path, value), create)
    expect(errors('start', '2024-13').start).toEqual({ key: 'month' })
    expect(errors('end', '2024-01').end).toEqual({ key: 'endBeforeStart' })
    expect(errors('end', '').end).toEqual({ key: 'endRequired' })
    expect(errors('end', null)).toEqual({})
  })

  it('counts characters as the backend does (code points) and checks every locale and bullet', () => {
    const emoji = '😀'.repeat(200) // 400 UTF-16 units, 200 code points: exactly the limit
    expect(validateDraft(collection('experience'), setAt(experienceDraft(), 'translations.en.role', emoji), create)).toEqual({})
    const errors = validateDraft(
      collection('experience'),
      setAt(setAt(experienceDraft(), 'translations.zh-Hant.role', ''), 'translations.en.bullets', ['ok', 'x'.repeat(1001)]),
      create,
    )
    expect(errors['translations.zh-Hant.role']).toEqual({ key: 'required' })
    expect(errors['translations.en.bullets.1']).toEqual({ key: 'tooLong', values: { max: 1000 } })
  })

  it('checks chips: each text, each translation, and the list length', () => {
    const tooMany = Array.from({ length: 51 }, (_, index) => `Tag ${index}`)
    expect(validateDraft(collection('experience'), setAt(experienceDraft(), 'tech', tooMany), create).tech).toEqual({
      key: 'tagsTooMany',
      values: { count: 50 },
    })
    const errors = validateDraft(
      collection('experience'),
      setAt(experienceDraft(), 'tech', [' ', { en: 'x'.repeat(101), 'zh-Hant': '' }]),
      create,
    )
    expect(errors['tech.0']).toEqual({ key: 'required' })
    expect(errors['tech.1.en']).toEqual({ key: 'tooLong', values: { max: 100 } })
    expect(errors['tech.1.zh-Hant']).toEqual({ key: 'required' })
    // A skill group needs at least one chip.
    const group = { slug: 'x', items: [], translations: { en: { label: 'X' }, 'zh-Hant': { label: 'X' } } }
    expect(validateDraft(collection('skill-groups'), group, create).items).toEqual({ key: 'tagsTooFew', values: { count: 1 } })
  })

  it('accepts every link the backend accepts, never fewer, and a four-digit year', () => {
    const link = (href: string) =>
      validateDraft(
        collection('contact-links'),
        { slug: 'x', href, display: 'x', translations: { en: { label: 'X' }, 'zh-Hant': { label: 'X' } } },
        create,
      ).href
    expect(link('mailto:jane@example.com')).toBeUndefined()
    expect(link('https://example.com/jane')).toBeUndefined()
    // A stored http:// link, or one with a space, must not block saving another field of the row.
    expect(link('http://example.com')).toBeUndefined()
    expect(link('https://example.com/a b')).toBeUndefined()
    expect(link('jane@example.com')).toEqual({ key: 'link' })
    // The backend's prefixes are case-sensitive: this would come back as a 422.
    expect(link('HTTPS://example.com')).toEqual({ key: 'link' })
    const projectUrl = (url: string) =>
      validateDraft(
        collection('projects'),
        {
          slug: 'x',
          placeholder: false,
          url,
          tech: [],
          translations: { en: { title: 'X', summary: 'X' }, 'zh-Hant': { title: 'X', summary: 'X' } },
        },
        create,
      ).url
    expect(projectUrl('')).toBeUndefined()
    expect(projectUrl('http://example.com/shop')).toBeUndefined()
    expect(projectUrl('https://example.com:8443/a?b=c#d')).toBeUndefined()
    expect(projectUrl('  https://example.com/shop  ')).toBeUndefined() // trimmed, like the payload
    expect(projectUrl('mailto:jane@example.com')).toEqual({ key: 'webUrl' })
    // A project link must parse as an http(s) URL with a host, as the backend now checks: a
    // prefix alone is not enough, and whitespace (which a parser would quietly encode) is refused.
    for (const url of ['https://', 'http://', 'https:// example.com', 'https://exa mple.com', 'https://example.com/a b', 'ftp://example.com', 'example.com']) {
      expect(projectUrl(url), url).toEqual({ key: 'webUrl' })
    }
    // What the browser's parser would normalise but the backend refuses: never looser than the server.
    for (const url of [
      'HTTPS://example.com',
      'http:/example.com',
      'http:///example.com',
      'http://exa%41mple.com',
      'http://exa\\mple.com',
      'http://example.com:0',
      'http://example.com:70000',
      'http://[::1',
    ]) {
      expect(projectUrl(url), url).toEqual({ key: 'webUrl' })
    }
    for (const url of ['http://user@example.com:8080/a', 'https://[::1]:8443/', 'https://例子.測試/']) {
      expect(projectUrl(url), url).toBeUndefined()
    }
    const year = (value: string) =>
      validateDraft(
        collection('education'),
        { slug: 'x', school: 'X', year: value, translations: { en: { degree: 'X' }, 'zh-Hant': { degree: 'X' } } },
        create,
      ).year
    expect(year('2020')).toBeUndefined()
    expect(year('20')).toEqual({ key: 'year' })
  })

  it('skips hidden fields and refuses a placeholder that still has an image', () => {
    const placeholder = {
      slug: 'slot',
      placeholder: true,
      url: 'not a url',
      tech: [],
      translations: { en: { title: '', summary: '' }, 'zh-Hant': { title: '', summary: '' } },
    }
    expect(validateDraft(collection('projects'), placeholder, create)).toEqual({})
    expect(
      validateDraft(collection('projects'), placeholder, { ...create, image: { url: '/x', width: 1, height: 1 } }).placeholder,
    ).toEqual({ key: 'placeholderImage' })
  })
})

describe('mapServerFields', () => {
  const slots = errorSlots(collection('experience'), experienceDraft(), 'create')

  it('lists a slot for every rendered control, chip and bullet', () => {
    for (const slot of [
      'slug',
      'company',
      'translations.en.role',
      'translations.zh-Hant.location',
      'start',
      'end',
      'tech',
      'tech.0',
      'tech.1',
      'tech.1.en',
      'translations.en.bullets',
      'translations.zh-Hant.bullets.0',
    ]) {
      expect(slots.has(slot), slot).toBe(true)
    }
    expect(errorSlots(collection('experience'), experienceDraft(), 'edit').has('slug')).toBe(false)
  })

  it('puts each key on the most specific slot it starts with; body and strangers go to the form', () => {
    const { errors, unmatched } = mapServerFields(
      {
        'translations.en.role': 'too long',
        'tech.0.str': 'not a string',
        'tech.0.Localized[str]': 'not a term either',
        'translations.zh-Hant.bullets.0': 'empty',
        body: 'end before start',
        'translations.fr': 'extra',
      },
      slots,
    )
    // A localized "rejected" message on each control: the server's English texts are not kept.
    expect(errors).toEqual({
      'translations.en.role': { key: 'serverRejected' },
      'tech.0': { key: 'serverRejected' },
      'translations.zh-Hant.bullets.0': { key: 'serverRejected' },
    })
    expect(unmatched).toEqual(['body', 'translations.fr'])
  })
})
