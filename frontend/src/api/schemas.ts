import * as z from 'zod/mini'
import type { ResolvedContent } from '../content/resolved'

/**
 * Runtime validation of what the backend sends (Phase 4 API contract), built on `zod/mini`: the
 * same validators as classic zod, tree-shakeable, so the bundle carries only the checks used here.
 * Every object schema is the default, non-strict `z.object()`: the contract lets the server add
 * keys later, and the client must ignore them. `contentPayloadSchema` is checked against
 * `ResolvedContent` at compile time, so the API shape and the static fallback cannot drift apart.
 */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const month = z.string().check(z.regex(MONTH))
const id = z.string().check(z.minLength(1))
const strings = z.array(z.string())

export const localeSchema = z.enum(['en', 'zh-Hant'])

const experienceItem = z.object({
  id,
  company: z.string(),
  role: z.string(),
  location: z.string(),
  start: month,
  end: z.nullable(month),
  bullets: strings,
  tech: strings,
})

const projectItem = z.object({
  id,
  placeholder: z.boolean(),
  title: z.nullable(z.string()),
  summary: z.nullable(z.string()),
  tech: strings,
  url: z.nullable(z.url({ protocol: /^https?$/ })),
})

const skillGroupItem = z.object({ id, label: z.string(), items: strings })
const educationItem = z.object({ id, degree: z.string(), school: z.string(), year: z.string() })
const certificationItem = z.object({ id, name: z.string(), inProgress: z.boolean() })
const spokenLanguageItem = z.object({ id, name: z.string() })
const contactLinkItem = z.object({ id, label: z.string(), href: z.string(), display: z.string() })

export const contentPayloadSchema = z.object({
  locale: localeSchema,
  experience: z.array(experienceItem),
  projects: z.array(projectItem),
  skills: z.object({
    groups: z.array(skillGroupItem),
    education: z.array(educationItem),
    certifications: z.array(certificationItem),
    languages: z.array(spokenLanguageItem),
  }),
  contact: z.object({ links: z.array(contactLinkItem), location: z.string() }),
}) satisfies z.ZodMiniType<ResolvedContent>

export type ContentPayload = z.infer<typeof contentPayloadSchema>

/** Every non-2xx response, on every route. `fields` is present only for `validation_error`. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.optional(z.record(z.string(), z.string())),
  }),
})

export type ApiErrorBody = z.infer<typeof apiErrorSchema>

/** `POST /contact` -> 202. */
export const contactAcceptedSchema = z.object({ status: z.literal('accepted') })
