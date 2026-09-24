import { describe, expect, it, vi } from 'vitest'
import { contentPayloadSchema } from '../api/schemas'
import type { Locale, ResolvedContent } from './resolved'
import en from './snapshot/en.json'
import zhHant from './snapshot/zh-Hant.json'
import { staticContent } from './staticContent'

// The other tests render a fixture (test/setup.ts); this one checks the real saved files.
vi.unmock('./staticContent')

const FILES: Record<Locale, unknown> = { en, 'zh-Hant': zhHant }
const LOCALES = Object.keys(FILES) as Locale[]

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id)

/**
 * The saved payloads (`npm run content:sync`) are the page's first paint and its fallback, so they
 * must be exactly what a live response would be: valid for the schema, nothing the schema drops
 * (an extra key would make every identical API answer look different and re-render the page), and
 * the same facts in both locales. Nothing here depends on what the content says: the owner edits
 * it in the admin panel and re-syncs these files.
 */
describe('content snapshot', () => {
  it('is a valid API payload of its own locale, key for key', () => {
    for (const locale of LOCALES) {
      const parsed = contentPayloadSchema.safeParse(FILES[locale])
      expect(parsed.success, `${locale}: ${parsed.error?.message}`).toBe(true)
      expect(parsed.data, locale).toEqual(FILES[locale])
      expect(parsed.data?.locale).toBe(locale)
      expect(staticContent(locale)).toBe(FILES[locale])
    }
  })

  it('carries the same items, in the same order, with the same untranslated facts in both locales', () => {
    const [a, b] = LOCALES.map(staticContent) as [ResolvedContent, ResolvedContent]

    expect(ids(b.experience)).toEqual(ids(a.experience))
    expect(b.experience.map((e) => [e.company, e.start, e.end, e.bullets.length, e.tech.length])).toEqual(
      a.experience.map((e) => [e.company, e.start, e.end, e.bullets.length, e.tech.length]),
    )
    expect(b.projects.map((p) => [p.id, p.placeholder, p.url, p.image, p.tech.length])).toEqual(
      a.projects.map((p) => [p.id, p.placeholder, p.url, p.image, p.tech.length]),
    )
    expect(b.skills.groups.map((g) => [g.id, g.items.length])).toEqual(a.skills.groups.map((g) => [g.id, g.items.length]))
    expect(b.skills.education.map((e) => [e.id, e.school, e.year])).toEqual(a.skills.education.map((e) => [e.id, e.school, e.year]))
    expect(b.skills.certifications).toEqual(a.skills.certifications)
    expect(ids(b.skills.languages)).toEqual(ids(a.skills.languages))
    expect(b.contact.links.map((l) => [l.id, l.href, l.display])).toEqual(a.contact.links.map((l) => [l.id, l.href, l.display]))
    expect(b.cv).toEqual(a.cv)
  })

  it('is resolved text: no i18n key, no term object, no empty prose', () => {
    for (const locale of LOCALES) {
      const content = staticContent(locale)
      const json = JSON.stringify(content)
      expect(json, locale).not.toMatch(/"content\.[a-z]/)
      expect(json, locale).not.toContain('"zh-Hant":')
      const prose = [
        ...content.experience.flatMap((e) => [e.role, e.location, ...e.bullets, ...e.tech]),
        ...content.skills.groups.flatMap((g) => [g.label, ...g.items]),
        ...content.skills.education.map((e) => e.degree),
        ...content.skills.languages.map((l) => l.name),
        ...content.contact.links.map((l) => l.label),
      ]
      for (const text of prose) expect(text.trim(), locale).not.toBe('')
    }
  })

  it('is two different payloads, not one locale saved twice', () => {
    const withoutLocale = ({ locale: _locale, ...content }: ResolvedContent) => content
    expect(withoutLocale(staticContent('zh-Hant'))).not.toEqual(withoutLocale(staticContent('en')))
  })
})
