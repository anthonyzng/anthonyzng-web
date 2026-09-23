import { describe, expect, it } from 'vitest'
import { contentPayloadSchema } from '../api/schemas'
import i18n from '../i18n'
import { isSameJson } from './isSameContent'
import { resolveStaticContent, type Locale } from './resolved'

const LOCALES: readonly Locale[] = ['en', 'zh-Hant']
const resolve = (locale: Locale) => resolveStaticContent(i18n.getFixedT(locale), locale)

/**
 * The static snapshot must be indistinguishable from an API payload: same shape, same resolution
 * rules. Both paths feed the same sections, so a drift here would show as a flash on the swap.
 */
describe('resolveStaticContent', () => {
  it('produces exactly the API payload shape in both locales', () => {
    for (const locale of LOCALES) {
      const content = resolve(locale)
      const parsed = contentPayloadSchema.parse(content)
      expect(parsed, locale).toEqual(content)
      expect(parsed.locale).toBe(locale)
    }
  })

  it('resolves prose and descriptive chips into the locale and keeps proper nouns', () => {
    const zh = resolve('zh-Hant')
    expect(zh.experience.map((entry) => entry.id)).toEqual(['sksys', 'hactl', 'ivc'])
    expect(zh.experience[1]).toMatchObject({
      company: 'Hong Kong Air Cargo Terminals Limited (HACTL)',
      role: '高級資訊科技協調員',
      location: '香港',
      start: '2021-08',
      end: '2022-10',
      tech: ['Microsoft Azure', '數據管道', 'Power BI', '企業應用系統'],
    })
    expect(zh.experience[0].end).toBeNull()
    expect(zh.skills.groups.find((group) => group.id === 'ai')).toEqual({
      id: 'ai',
      label: 'AI 開發',
      items: ['LLM 輔助開發', 'AI 編程代理（Claude Code）', '提示詞設計', 'AI 工作流程自動化'],
    })
    expect(zh.skills.education[0]).toEqual({
      id: 'uwe',
      degree: '資訊科技（榮譽）理學士 — 一級榮譽',
      school: 'University of the West of England, Bristol',
      year: '2020',
    })
    expect(zh.skills.certifications.find((c) => c.id === 'pmp')).toEqual({ id: 'pmp', name: 'PMP', inProgress: true })
    expect(zh.skills.languages.map((language) => language.name)).toEqual(['英文', '普通話', '廣東話'])
    expect(zh.contact.links[0]).toMatchObject({ id: 'email', label: '電郵', href: 'mailto:anthonyzng075@gmail.com' })
    expect(zh.contact.location).toBe('加拿大安大略省')
  })

  it('shapes a reserved project slot the way the API does', () => {
    expect(resolve('en').projects).toEqual([
      { id: 'slotOne', placeholder: true, title: null, summary: null, tech: [], url: null },
      { id: 'slotTwo', placeholder: true, title: null, summary: null, tech: [], url: null },
    ])
  })

  it('leaves no i18n key and no term object in the resolved text', () => {
    for (const locale of LOCALES) {
      const json = JSON.stringify(resolve(locale))
      expect(json, locale).not.toMatch(/content\.[a-z]/)
      expect(json, locale).not.toContain('"term"')
    }
  })

  it('differs between the locales only where prose was translated', () => {
    const en = resolve('en')
    const zh = resolve('zh-Hant')
    expect(en).not.toEqual(zh)
    expect(en.experience.map((e) => [e.id, e.company, e.start, e.end])).toEqual(
      zh.experience.map((e) => [e.id, e.company, e.start, e.end]),
    )
    expect(en.skills.certifications).toEqual(zh.skills.certifications)
    expect(en.contact.links.map((link) => [link.href, link.display])).toEqual(
      zh.contact.links.map((link) => [link.href, link.display]),
    )
  })
})

describe('isSameJson', () => {
  it('compares structure, not key order or identity', () => {
    expect(isSameJson({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 })).toBe(true)
    expect(isSameJson(resolve('en'), structuredClone(resolve('en')))).toBe(true)
    expect(isSameJson(resolve('en'), resolve('zh-Hant'))).toBe(false)
    expect(isSameJson({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(isSameJson([1, 2], [2, 1])).toBe(false)
    expect(isSameJson(null, {})).toBe(false)
  })
})
