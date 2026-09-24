import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { COLLECTION_IDS, getCollection, type Collection } from './collections'
import { getAt, setAt } from './draft'
import { ADMIN_NS } from './i18n'
import { certifications, experience, projects, siteTexts } from './test/fixtures'

const collection = (id: string): Collection => getCollection(id)!
const t = i18n.getFixedT('en', ADMIN_NS)

describe('collections', () => {
  it('know only the contract collections', () => {
    expect(getCollection('experience')?.id).toBe('experience')
    expect(getCollection('recipes')).toBeNull()
    expect(getCollection(undefined)).toBeNull()
    expect(collection('site-texts')).toMatchObject({ sortable: false, creatable: false })
  })

  it('never put an order in a payload: the server owns it', () => {
    for (const id of COLLECTION_IDS) {
      expect(collection(id).toPayload(collection(id).emptyDraft()), id).not.toHaveProperty('sortOrder')
    }
    expect(collection('certifications').toPayload(collection('certifications').toDraft(certifications()[1]))).toEqual({
      slug: 'pm202',
      name: 'Project Management 202',
      inProgress: true,
    })
  })

  it('give every row a readable title', () => {
    expect(collection('experience').title(experience()[0], t)).toBe('Lead Developer · Acme Corp')
    expect(collection('projects').title(projects()[1], t)).toBe('Placeholder slot (slotTwo)')
    expect(collection('site-texts').title(siteTexts()[0], t)).toBe('Contact section: location line')
    expect(collection('site-texts').title({ ...siteTexts()[0], slug: 'footer_note' }, t)).toBe('footer_note')
    expect(collection('certifications').detail(certifications()[1], t, 'en')).toBe('In progress')
  })

  it('round-trip a row through the form without read-only keys', () => {
    const [shop] = projects()
    const withImage = { ...shop, image: { url: '/x', width: 1, height: 1 } }
    const draft = collection('projects').toDraft(withImage)
    expect(draft).not.toHaveProperty('image')
    expect(draft).not.toHaveProperty('updatedAt')
    expect(draft).not.toHaveProperty('sortOrder')
    expect(collection('projects').toPayload(draft)).toEqual({
      slug: 'shop',
      placeholder: false,
      url: 'https://example.com/shop',
      tech: ['React'],
      translations: {
        en: { title: 'Web shop', summary: 'An online shop.' },
        'zh-Hant': { title: '網店', summary: '網上商店。' },
      },
    })
  })

  it('trim the payload, turn an empty link into null and empty a placeholder', () => {
    const projectsCollection = collection('projects')
    let draft = projectsCollection.toDraft(projects()[0])
    draft = setAt(setAt(draft, 'url', '   '), 'translations.en.title', '  Web shop  ')
    const payload = projectsCollection.toPayload(draft)
    expect(payload.url).toBeNull()
    expect(getAt(payload, 'translations.en.title')).toBe('Web shop')

    const placeholder = projectsCollection.toPayload(setAt(draft, 'placeholder', true))
    expect(placeholder).toMatchObject({ placeholder: true, url: null, tech: [] })
    expect(placeholder.translations).toEqual({ en: { title: null, summary: null }, 'zh-Hant': { title: null, summary: null } })
  })

  it('pair bullets by index, padding a stored mismatch, and keep chips to their write shape', () => {
    const [acme] = experience()
    const odd = {
      ...acme,
      tech: [{ en: 'Data pipelines', 'zh-Hant': '數據管道', note: 'server extra' } as never],
      translations: { ...acme.translations, 'zh-Hant': { ...acme.translations['zh-Hant'], bullets: ['只有一點。'] } },
    }
    const draft = collection('experience').toDraft(odd)
    expect(getAt(draft, 'translations.zh-Hant.bullets')).toEqual(['只有一點。', ''])
    expect(getAt(draft, 'tech')).toEqual([{ en: 'Data pipelines', 'zh-Hant': '數據管道' }])
  })
})
