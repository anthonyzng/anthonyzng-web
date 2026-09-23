import { describe, expect, it } from 'vitest'
import { CONTACT_LINKS } from '../content/contact'
import { EXPERIENCE } from '../content/experience'
import { PROJECTS } from '../content/projects'
import { CERTIFICATIONS, EDUCATION, SKILL_GROUPS, SPOKEN_LANGUAGES } from '../content/skills'
import { tagKey, type Tag } from '../content/tags'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object') {
      for (const [nested, leaf] of flatten(value, path)) out.set(nested, leaf)
    } else {
      out.set(path, value)
    }
  }
  return out
}

const placeholders = (value: string) => [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort()

const enKeys = flatten(en as Tree)
const zhKeys = flatten(zhHant as Tree)

describe('locales', () => {
  it('have identical key sets', () => {
    const missingInZh = [...enKeys.keys()].filter((key) => !zhKeys.has(key))
    const missingInEn = [...zhKeys.keys()].filter((key) => !enKeys.has(key))
    expect({ missingInZh, missingInEn }).toEqual({ missingInZh: [], missingInEn: [] })
  })

  it('have only non-empty string values', () => {
    for (const [key, value] of [...enKeys, ...zhKeys]) {
      expect(typeof value, key).toBe('string')
      expect((value as string).trim().length, key).toBeGreaterThan(0)
    }
  })

  it('use the same {{placeholders}} in both languages', () => {
    for (const [key, value] of enKeys) {
      const other = zhKeys.get(key)
      if (typeof value !== 'string' || typeof other !== 'string') continue
      expect(placeholders(other), key).toEqual(placeholders(value))
    }
  })

  it('no longer contain the removed placeholder keys', () => {
    for (const keys of [enKeys, zhKeys]) {
      expect(keys.has('home.comingSoon')).toBe(false)
      expect(keys.has('home.name')).toBe(false)
      // The sections carry real content now, so the shared "coming soon" line is gone.
      expect(keys.has('sections.comingSoon')).toBe(false)
    }
  })

  it('define every key the content modules ask for', () => {
    for (const key of contentKeys()) {
      expect(enKeys.has(key), `en: ${key}`).toBe(true)
      expect(zhKeys.has(key), `zh-Hant: ${key}`).toBe(true)
    }
  })

  it('translates every descriptive chip instead of leaving English on the Chinese page', () => {
    for (const key of [...contentKeys()].filter((key) => key.startsWith('content.terms.'))) {
      expect(zhKeys.get(key), key).not.toEqual(enKeys.get(key))
    }
  })
})

/**
 * Every i18n key the sections build from `src/content/`, derived exactly the way the components
 * derive it. Adding an entry, a bullet, a skill group or a descriptive chip therefore fails here
 * until both locales carry its text.
 */
function contentKeys(): string[] {
  const keys = [
    'content.techOf',
    'content.experience.present',
    'content.projects.note',
    'content.contact.location',
    'content.contact.formNote',
  ]

  // Chips are either proper nouns (no key) or terms translated under content.terms.<id>.
  const tags = (items: readonly Tag[]) => items.map(tagKey).filter((key): key is string => key !== null)

  for (const entry of EXPERIENCE) {
    keys.push(`content.experience.${entry.id}.role`, `content.experience.${entry.id}.location`)
    for (const bullet of entry.bullets) keys.push(`content.experience.${entry.id}.bullets.${bullet}`)
    keys.push(...tags(entry.tech))
  }

  for (const project of PROJECTS) {
    if (project.placeholder) {
      keys.push(
        'content.projects.placeholder.badge',
        'content.projects.placeholder.title',
        'content.projects.placeholder.summary',
      )
    } else {
      keys.push(`content.projects.items.${project.id}.title`, `content.projects.items.${project.id}.summary`)
    }
    if (project.url) keys.push('content.projects.visit')
    keys.push(...tags(project.tech))
  }

  for (const group of SKILL_GROUPS) {
    keys.push(`content.skills.groups.${group.id}`)
    keys.push(...tags(group.items))
  }
  keys.push(
    'content.skills.credentials.title',
    'content.skills.credentials.education.label',
    'content.skills.credentials.certifications.label',
    'content.skills.credentials.languages.label',
  )
  for (const entry of EDUCATION) keys.push(`content.skills.credentials.education.${entry.id}`)
  if (CERTIFICATIONS.some((certification) => certification.inProgress)) {
    keys.push('content.skills.credentials.certifications.inProgress')
  }
  for (const language of SPOKEN_LANGUAGES) keys.push(`content.skills.credentials.languages.${language}`)

  keys.push('content.contact.labels.email', 'content.contact.labels.location')
  for (const link of CONTACT_LINKS) keys.push(`content.contact.labels.${link.id}`)

  return keys
}
