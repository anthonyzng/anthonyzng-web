import * as z from 'zod/mini'
import { isObject } from './draft'

/**
 * Runtime validation of the admin API's responses (Phase 5 contract), in `zod/mini` like
 * `src/api/schemas.ts`. Every object schema is the default, non-strict `z.object()`: keys the
 * server adds later are dropped from the parsed value, so they never flow back into a write.
 * Field values are checked for their JSON type only (a month is any string, a URL any string):
 * the admin must be able to open a row that breaks today's rules in order to repair it.
 *
 * Bundle note: zod's modules are shared with the public bundle, so every zod constructor used
 * here but not by the public schemas lands in the public main chunk, not in this lazy one.
 * Numbers, tags and "no body" are therefore type guards on `z.unknown()` (the smallest
 * constructor there is) instead of `z.number()`, `z.union()` and `z.undefined()` (about 2 KB).
 */

export type Locale = 'en' | 'zh-Hant'
export const LOCALES: readonly Locale[] = ['en', 'zh-Hant']

/** A proper noun (`"React"`) or a translated term (`{"en": "Data pipelines", "zh-Hant": "數據管道"}`). */
export type TermTag = { en: string; 'zh-Hant': string }
export type Tag = string | TermTag

const isTag = (value: unknown): value is Tag =>
  typeof value === 'string' || (isObject(value) && typeof value.en === 'string' && typeof value['zh-Hant'] === 'string')

/** A schema that accepts exactly what `test` accepts (zod/mini's function check on `z.unknown()`). */
function guard<T>(test: (value: unknown) => value is T, expected: string): z.ZodMiniType<T> {
  return z.unknown().check((payload) => {
    if (!test(payload.value)) payload.issues.push({ code: 'custom', input: payload.value, message: `Expected ${expected}` })
  }) as z.ZodMiniType<T>
}

const localized = <T extends z.ZodMiniType>(inner: T) => z.object({ en: inner, 'zh-Hant': inner })

const number = guard((value): value is number => typeof value === 'number' && Number.isFinite(value), 'a number')
export const tagSchema = guard(isTag, 'a tag')

const tags = z.array(tagSchema)
const slug = z.string()
const sortOrder = number
const updatedAt = z.string()

export const imageRefSchema = z.object({ url: z.string(), width: number, height: number })
export type ImageRef = z.infer<typeof imageRefSchema>

export const cvRefSchema = z.object({ url: z.string(), filename: z.string(), size: number, updatedAt: z.string() })
export type CvRef = z.infer<typeof cvRefSchema>

export const experienceItemSchema = z.object({
  slug,
  sortOrder,
  company: z.string(),
  start: z.string(),
  end: z.nullable(z.string()),
  tech: tags,
  translations: localized(z.object({ role: z.string(), location: z.string(), bullets: z.array(z.string()) })),
  updatedAt,
})
export type ExperienceItem = z.infer<typeof experienceItemSchema>

export const projectItemSchema = z.object({
  slug,
  sortOrder,
  placeholder: z.boolean(),
  url: z.nullable(z.string()),
  tech: tags,
  translations: localized(z.object({ title: z.nullable(z.string()), summary: z.nullable(z.string()) })),
  image: z.nullable(imageRefSchema),
  updatedAt,
})
export type ProjectItem = z.infer<typeof projectItemSchema>

export const skillGroupItemSchema = z.object({
  slug,
  sortOrder,
  items: tags,
  translations: localized(z.object({ label: z.string() })),
  updatedAt,
})
export type SkillGroupItem = z.infer<typeof skillGroupItemSchema>

export const educationItemSchema = z.object({
  slug,
  sortOrder,
  school: z.string(),
  year: z.string(),
  translations: localized(z.object({ degree: z.string() })),
  updatedAt,
})

export const certificationItemSchema = z.object({ slug, sortOrder, name: z.string(), inProgress: z.boolean(), updatedAt })
export type CertificationItem = z.infer<typeof certificationItemSchema>

export const languageItemSchema = z.object({ slug, sortOrder, translations: localized(z.object({ name: z.string() })), updatedAt })

export const contactLinkItemSchema = z.object({
  slug,
  sortOrder,
  href: z.string(),
  display: z.string(),
  translations: localized(z.object({ label: z.string() })),
  updatedAt,
})

/** No `sortOrder`: site texts are addressed by slug only. */
export const siteTextItemSchema = z.object({ slug, translations: localized(z.object({ text: z.string() })), updatedAt })
export type SiteTextItem = z.infer<typeof siteTextItemSchema>

/** `POST /auth/login` and `GET /auth/me`. */
export const adminInfoSchema = z.object({ email: z.string() })

/** `GET /admin/summary`. Counts are a record, so a collection the server adds later cannot break the dashboard. */
export const summarySchema = z.object({
  counts: z.record(z.string(), number),
  unreadMessages: number,
  cv: z.nullable(cvRefSchema),
})
export type Summary = z.infer<typeof summarySchema>

/** `GET` / `PUT` / `DELETE /admin/cv`. */
export const cvResponseSchema = z.object({ cv: z.nullable(cvRefSchema) })

/** A contact-form submission. `deliveryStatus` stays a string: an unknown status must not hide the inbox. */
export const messageSchema = z.object({
  id: number,
  name: z.string(),
  email: z.string(),
  message: z.string(),
  createdAt: z.string(),
  readAt: z.nullable(z.string()),
  deliveryStatus: z.string(),
  deliveryError: z.nullable(z.string()),
  source: z.string(),
  userAgent: z.nullable(z.string()),
})
export type Message = z.infer<typeof messageSchema>

/**
 * `GET /admin/messages`: `total` counts the current filter as of `asOf` (the moment the set was
 * taken, to pass back for the later pages), `unread` the whole inbox now (the badge).
 */
export const messagesPageSchema = z.object({ items: z.array(messageSchema), total: number, unread: number, asOf: z.string() })
export type MessagesPage = z.infer<typeof messagesPageSchema>

/** A 204 has no body: `requestJson` hands the schema `undefined`. */
export const noContentSchema = guard((value): value is undefined => value === undefined, 'no content')
