import * as z from 'zod/mini'
import { formatMonth } from '../i18n/formatMonth'
import { cleanTag, getBoolean, getString, trimDeep, type Draft, type Json } from './draft'
import type { FieldConfig, TextField } from './fields'
import type { Translate } from './i18n'
import {
  certificationItemSchema,
  contactLinkItemSchema,
  educationItemSchema,
  experienceItemSchema,
  languageItemSchema,
  projectItemSchema,
  siteTextItemSchema,
  skillGroupItemSchema,
  type ExperienceItem,
  type ProjectItem,
} from './schemas'

/** The content collections, in navigation order; each id is also its URL segment and API path. */
export const COLLECTION_IDS = [
  'experience',
  'projects',
  'skill-groups',
  'education',
  'certifications',
  'languages',
  'contact-links',
  'site-texts',
] as const

export type CollectionId = (typeof COLLECTION_IDS)[number]

/** What every row has; the rest depends on the collection. */
export interface ContentItem {
  readonly slug: string
  readonly sortOrder?: number
  readonly updatedAt: string
}

/**
 * One collection as the list and the editor use it. Methods take the row type erased to
 * `ContentItem`; each is only ever called with rows parsed by the same collection's schema.
 */
export interface Collection {
  readonly id: CollectionId
  /**
   * Rows carry a `sortOrder`: the list offers move buttons. The order is the server's: it places a
   * new row and keeps a row's place on an edit (the form never sends one).
   */
  readonly sortable: boolean
  /** Rows can be added and deleted. Site texts are a fixed set: edit only. */
  readonly creatable: boolean
  readonly itemSchema: z.ZodMiniType<ContentItem>
  readonly listSchema: z.ZodMiniType<{ items: ContentItem[] }>
  readonly fields: readonly FieldConfig[]
  /** A readable name for the row (list, dialogs, status messages). */
  title(item: ContentItem, t: Translate): string
  /** A secondary line for the list, or null. */
  detail(item: ContentItem, t: Translate, language: string): string | null
  emptyDraft(): Draft
  toDraft(item: ContentItem): Draft
  /** The write shape: trimmed, optional inputs as null; `sortOrder` and the read-only keys are never included. */
  toPayload(draft: Draft): Record<string, Json>
}

interface Definition<T extends ContentItem> {
  id: CollectionId
  sortable: boolean
  creatable: boolean
  itemSchema: z.ZodMiniType<T>
  fields: readonly FieldConfig[]
  title(item: T, t: Translate): string
  detail(item: T, t: Translate, language: string): string | null
  emptyDraft(): Draft
  toDraft(item: T): Draft
  toPayload?(draft: Draft): Record<string, Json>
}

const trimmedPayload = (draft: Draft): Record<string, Json> => trimDeep(draft) as Record<string, Json>

function define<T extends ContentItem>(definition: Definition<T>): Collection {
  return {
    id: definition.id,
    sortable: definition.sortable,
    creatable: definition.creatable,
    itemSchema: definition.itemSchema as unknown as z.ZodMiniType<ContentItem>,
    listSchema: z.object({ items: z.array(definition.itemSchema) }) as unknown as z.ZodMiniType<{ items: ContentItem[] }>,
    fields: definition.fields,
    title: (item, t) => definition.title(item as T, t),
    detail: (item, t, language) => definition.detail(item as T, t, language),
    emptyDraft: definition.emptyDraft,
    toDraft: (item) => definition.toDraft(item as T),
    toPayload: definition.toPayload ?? trimmedPayload,
  }
}

const text = (name: string, max: number, overrides: Partial<TextField> = {}): TextField => ({
  kind: 'text',
  control: 'text',
  name,
  label: name,
  localized: false,
  max,
  required: true,
  ...overrides,
})

const localizedText = (name: string, max: number, overrides: Partial<TextField> = {}): TextField =>
  text(name, max, { localized: true, ...overrides })

/** `{ en: {...}, "zh-Hant": {...} }` built from one factory, so both locales always have the same keys. */
const bothLocales = (make: (locale: 'en' | 'zh-Hant') => Draft): Draft => ({ en: make('en'), 'zh-Hant': make('zh-Hant') })

const joined = (...parts: readonly (string | null | undefined)[]): string => parts.filter((part) => part).join(' · ')

const notPlaceholder = (draft: Draft): boolean => !getBoolean(draft, 'placeholder')

/** Bullet rows pair the locales by index; a stored mismatch (never valid) is padded rather than lost. */
function pairedBullets(item: ExperienceItem): { en: string[]; zh: string[] } {
  const { en, 'zh-Hant': zh } = item.translations
  const count = Math.max(en.bullets.length, zh.bullets.length, 1)
  const pad = (bullets: readonly string[]) => Array.from({ length: count }, (_, index) => bullets[index] ?? '')
  return { en: pad(en.bullets), zh: pad(zh.bullets) }
}

const experience = define<ExperienceItem>({
  id: 'experience',
  sortable: true,
  creatable: true,
  itemSchema: experienceItemSchema,
  fields: [
    text('company', 200),
    { kind: 'slug', label: 'slug', source: 'company' },
    localizedText('role', 200),
    localizedText('location', 200),
    text('start', 7, { control: 'month' }),
    { kind: 'end', label: 'end' },
    { kind: 'tags', name: 'tech', label: 'tech', hint: 'tags', min: 0, max: 50 },
    { kind: 'bullets', label: 'bullets', hint: 'bullets', min: 1, max: 20, itemMax: 1000 },
  ],
  title: (item) => joined(item.translations.en.role, item.company) || item.slug,
  detail: (item, t, language) =>
    `${formatMonth(item.start, language)} – ${item.end === null ? t('list.present') : formatMonth(item.end, language)}`,
  emptyDraft: () => ({
    slug: '',
    company: '',
    start: '',
    end: '',
    tech: [],
    translations: bothLocales(() => ({ role: '', location: '', bullets: [''] })),
  }),
  toDraft: (item) => {
    const bullets = pairedBullets(item)
    return {
      slug: item.slug,
      company: item.company,
      start: item.start,
      end: item.end,
      tech: item.tech.map(cleanTag),
      translations: bothLocales((locale) => ({
        role: item.translations[locale].role,
        location: item.translations[locale].location,
        bullets: locale === 'en' ? bullets.en : bullets.zh,
      })),
    }
  },
})

const projects = define<ProjectItem>({
  id: 'projects',
  sortable: true,
  creatable: true,
  itemSchema: projectItemSchema,
  fields: [
    { kind: 'boolean', name: 'placeholder', label: 'placeholder', hint: 'placeholder' },
    localizedText('title', 200, { required: notPlaceholder, visible: notPlaceholder }),
    { kind: 'slug', label: 'slug', source: 'translations.en.title' },
    localizedText('summary', 2000, { control: 'textarea', required: notPlaceholder, visible: notPlaceholder }),
    text('url', 2048, { control: 'url', scheme: 'web', required: false, hint: 'projectUrl', visible: notPlaceholder }),
    { kind: 'tags', name: 'tech', label: 'tech', hint: 'tags', min: 0, max: 50, visible: notPlaceholder },
  ],
  title: (item, t) => item.translations.en.title || t('list.placeholderTitle', { slug: item.slug }),
  detail: (item, t) => (item.placeholder ? t('list.placeholder') : item.url),
  emptyDraft: () => ({
    slug: '',
    placeholder: false,
    url: '',
    tech: [],
    translations: bothLocales(() => ({ title: '', summary: '' })),
  }),
  toDraft: (item) => ({
    slug: item.slug,
    placeholder: item.placeholder,
    url: item.url ?? '',
    tech: item.tech.map(cleanTag),
    translations: bothLocales((locale) => ({
      title: item.translations[locale].title ?? '',
      summary: item.translations[locale].summary ?? '',
    })),
  }),
  // A placeholder is a reserved slot: no copy, link or chips (the backend rejects any of them).
  toPayload: (draft) => {
    const payload = trimmedPayload(draft)
    if (getBoolean(draft, 'placeholder')) {
      return { ...payload, url: null, tech: [], translations: bothLocales(() => ({ title: null, summary: null })) }
    }
    const url = getString(payload, 'url')
    return { ...payload, url: url === '' ? null : url }
  },
})

const skillGroups = define({
  id: 'skill-groups',
  sortable: true,
  creatable: true,
  itemSchema: skillGroupItemSchema,
  fields: [
    localizedText('label', 100, { label: 'groupLabel' }),
    { kind: 'slug', label: 'slug', source: 'translations.en.label' },
    { kind: 'tags', name: 'items', label: 'skills', hint: 'tags', min: 1, max: 50 },
  ],
  title: (item) => item.translations.en.label || item.slug,
  detail: (item, t) => t('list.skillCount', { count: item.items.length }),
  emptyDraft: () => ({ slug: '', items: [], translations: bothLocales(() => ({ label: '' })) }),
  toDraft: (item) => ({
    slug: item.slug,
    items: item.items.map(cleanTag),
    translations: bothLocales((locale) => ({ label: item.translations[locale].label })),
  }),
})

const education = define({
  id: 'education',
  sortable: true,
  creatable: true,
  itemSchema: educationItemSchema,
  fields: [
    text('school', 200),
    { kind: 'slug', label: 'slug', source: 'school' },
    localizedText('degree', 200),
    text('year', 4, { control: 'year' }),
  ],
  title: (item) => item.school || item.slug,
  detail: (item) => joined(item.translations.en.degree, item.year),
  emptyDraft: () => ({ slug: '', school: '', year: '', translations: bothLocales(() => ({ degree: '' })) }),
  toDraft: (item) => ({
    slug: item.slug,
    school: item.school,
    year: item.year,
    translations: bothLocales((locale) => ({ degree: item.translations[locale].degree })),
  }),
})

const certifications = define({
  id: 'certifications',
  sortable: true,
  creatable: true,
  itemSchema: certificationItemSchema,
  fields: [
    text('name', 200, { label: 'certificationName' }),
    { kind: 'slug', label: 'slug', source: 'name' },
    { kind: 'boolean', name: 'inProgress', label: 'inProgress' },
  ],
  title: (item) => item.name || item.slug,
  detail: (item, t) => (item.inProgress ? t('list.inProgress') : null),
  emptyDraft: () => ({ slug: '', name: '', inProgress: false }),
  toDraft: (item) => ({ slug: item.slug, name: item.name, inProgress: item.inProgress }),
})

const languages = define({
  id: 'languages',
  sortable: true,
  creatable: true,
  itemSchema: languageItemSchema,
  fields: [
    localizedText('name', 100, { label: 'languageName' }),
    { kind: 'slug', label: 'slug', source: 'translations.en.name' },
  ],
  title: (item) => item.translations.en.name || item.slug,
  detail: (item) => item.translations['zh-Hant'].name || null,
  emptyDraft: () => ({ slug: '', translations: bothLocales(() => ({ name: '' })) }),
  toDraft: (item) => ({ slug: item.slug, translations: bothLocales((locale) => ({ name: item.translations[locale].name })) }),
})

const contactLinks = define({
  id: 'contact-links',
  sortable: true,
  creatable: true,
  itemSchema: contactLinkItemSchema,
  fields: [
    localizedText('label', 100, { label: 'linkLabel' }),
    { kind: 'slug', label: 'slug', source: 'translations.en.label' },
    text('href', 2048, { control: 'url', scheme: 'link', hint: 'href' }),
    text('display', 200, { hint: 'display' }),
  ],
  title: (item) => item.translations.en.label || item.slug,
  detail: (item) => item.display || null,
  emptyDraft: () => ({ slug: '', href: '', display: '', translations: bothLocales(() => ({ label: '' })) }),
  toDraft: (item) => ({
    slug: item.slug,
    href: item.href,
    display: item.display,
    translations: bothLocales((locale) => ({ label: item.translations[locale].label })),
  }),
})

const siteTexts = define({
  id: 'site-texts',
  sortable: false,
  creatable: false,
  itemSchema: siteTextItemSchema,
  fields: [
    { kind: 'slug', label: 'slug', source: null },
    localizedText('text', 2000, { control: 'textarea', hint: 'siteText' }),
  ],
  // Known rows get a name that says where the text appears; any other row is shown by its slug.
  title: (item, t) => t(`siteTexts.${item.slug}`, { defaultValue: item.slug }),
  detail: (item) => item.translations.en.text || null,
  emptyDraft: () => ({ slug: '', translations: bothLocales(() => ({ text: '' })) }),
  toDraft: (item) => ({ slug: item.slug, translations: bothLocales((locale) => ({ text: item.translations[locale].text })) }),
})

const COLLECTIONS: Readonly<Record<CollectionId, Collection>> = {
  experience,
  projects,
  'skill-groups': skillGroups,
  education,
  certifications,
  languages,
  'contact-links': contactLinks,
  'site-texts': siteTexts,
}

export const isCollectionId = (value: string | undefined): value is CollectionId =>
  (COLLECTION_IDS as readonly string[]).includes(value ?? '')

/** The collection for a URL segment, or null for anything else (the not-found screen). */
export const getCollection = (id: string | undefined): Collection | null => (isCollectionId(id) ? COLLECTIONS[id] : null)
