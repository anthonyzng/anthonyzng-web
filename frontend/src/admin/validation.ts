import type { Collection } from './collections'
import { getAt, getBoolean, getString, getStrings, getTags, isTermTag, textLength, type Draft } from './draft'
import { bulletsPath, isRequired, isVisible, localizedPath, TAG_MAX_LENGTH, type TagsField, type TextField } from './fields'
import type { Translate } from './i18n'
import { LOCALES, type ImageRef } from './schemas'
import { RESERVED_SLUGS, SLUG_PATTERN } from './slugify'

/**
 * Client-side checks that mirror the backend's write models, keyed by the same dotted paths as a
 * 422 `fields` object, plus the mapping of such an object back onto the rendered controls.
 */

/**
 * A message for one control: an admin i18n key under `errors.*`. A server rejection is one too
 * (`serverRejected`): the server's own text is English, written for developers, and never shown.
 */
export type FieldError = { key: string; values?: Record<string, string | number> }
export type FieldErrors = Readonly<Record<string, FieldError>>

export const fieldErrorText = (error: FieldError, t: Translate): string => t(`errors.${error.key}`, error.values)

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const YEAR = /^\d{4}$/
// The backend's rules (ContactLinkIn.href: a case-sensitive prefix; ProjectIn.url: a parsable http(s)
// URL): never stricter, so a stored value the server accepts cannot block saving an unrelated field,
// and never looser, so what passes here is not rejected there. The hints recommend https://.
const LINK = /^(mailto:|https?:\/\/)/

/** The start of a project link and its authority (userinfo, host, port), as the backend splits it. */
const WEB_URL = /^https?:\/\/([^/?#]*)/
/** Characters the backend refuses in a host name: controls, space and URL delimiters. */
const HOST_FORBIDDEN = new Set(['/', '\\', '?', '#', '@', '%', ':', '[', ']', '<', '>', '^', '|', '\u007f'])

const isHostName = (host: string): boolean =>
  host !== '' && [...host].every((character) => character > ' ' && !HOST_FORBIDDEN.has(character))

/** Empty (no port) or 1 to 65535. */
const isPort = (port: string): boolean => port === '' || (/^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535)

/**
 * A project link the backend accepts (`_check_web_url`): no whitespace (the browser's parser would
 * quietly encode it), the case-sensitive `http://` or `https://` prefix, a host name without
 * forbidden characters (an [IPv6] literal is left to the parser), a port from 1 to 65535, and a
 * URL the browser's own parser takes.
 */
function isWebUrl(value: string): boolean {
  if (/\s/.test(value)) return false
  const authority = WEB_URL.exec(value)?.[1]
  if (authority === undefined) return false
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1)
  if (hostPort.startsWith('[')) {
    const end = hostPort.indexOf(']')
    const rest = end < 0 ? null : hostPort.slice(end + 1)
    if (rest === null || (rest !== '' && !(rest.startsWith(':') && isPort(rest.slice(1))))) return false
  } else {
    const colon = hostPort.indexOf(':')
    const host = colon < 0 ? hostPort : hostPort.slice(0, colon)
    if (!isHostName(host) || (colon >= 0 && !isPort(hostPort.slice(colon + 1)))) return false
  }
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export interface ValidationContext {
  mode: 'create' | 'edit'
  /** Slugs already taken in this collection (create only). */
  existingSlugs: readonly string[]
  /** A project's saved cover image. */
  image?: ImageRef | null
}

function slugError(slug: string, existing: readonly string[]): FieldError | null {
  if (slug === '') return { key: 'required' }
  if (!SLUG_PATTERN.test(slug)) return { key: 'slugPattern' }
  if (RESERVED_SLUGS.includes(slug)) return { key: 'slugReserved', values: { slug } }
  if (existing.includes(slug)) return { key: 'slugTaken' }
  return null
}

function textError(field: TextField, value: string, draft: Draft): FieldError | null {
  const trimmed = value.trim()
  if (trimmed === '') return isRequired(field, draft) ? { key: 'required' } : null
  if (textLength(trimmed) > field.max) return { key: 'tooLong', values: { max: field.max } }
  switch (field.control) {
    case 'month':
      return MONTH.test(trimmed) ? null : { key: 'month' }
    case 'year':
      return YEAR.test(trimmed) ? null : { key: 'year' }
    case 'url':
      if (field.scheme === 'link') return LINK.test(trimmed) ? null : { key: 'link' }
      return isWebUrl(trimmed) ? null : { key: 'webUrl' }
    default:
      return null
  }
}

function chipError(value: string): FieldError | null {
  const trimmed = value.trim()
  if (trimmed === '') return { key: 'required' }
  return textLength(trimmed) > TAG_MAX_LENGTH ? { key: 'tooLong', values: { max: TAG_MAX_LENGTH } } : null
}

function tagErrors(field: TagsField, draft: Draft, errors: Record<string, FieldError>): void {
  const tags = getTags(draft, field.name)
  if (tags.length < field.min) errors[field.name] = { key: 'tagsTooFew', values: { count: field.min } }
  if (tags.length > field.max) errors[field.name] = { key: 'tagsTooMany', values: { count: field.max } }
  tags.forEach((tag, index) => {
    const path = `${field.name}.${index}`
    if (!isTermTag(tag)) {
      const error = chipError(tag)
      if (error) errors[path] = error
      return
    }
    for (const locale of LOCALES) {
      const error = chipError(tag[locale])
      if (error) errors[`${path}.${locale}`] = error
    }
  })
}

/** Every rule the backend applies to the draft, keyed by the paths its 422 would use. */
export function validateDraft(collection: Collection, draft: Draft, context: ValidationContext): FieldErrors {
  const errors: Record<string, FieldError> = {}
  for (const field of collection.fields) {
    if (!isVisible(field, draft)) continue
    switch (field.kind) {
      case 'slug': {
        if (context.mode !== 'create') break
        // Trimmed like every other text: the payload sends it trimmed.
        const error = slugError(getString(draft, 'slug').trim(), context.existingSlugs)
        if (error) errors.slug = error
        break
      }
      case 'text': {
        const paths = field.localized ? LOCALES.map((locale) => localizedPath(locale, field.name)) : [field.name]
        for (const path of paths) {
          const error = textError(field, getString(draft, path), draft)
          if (error) errors[path] = error
        }
        break
      }
      case 'end': {
        const end = getAt(draft, 'end')
        if (end === null) break // the current role
        const value = getString(draft, 'end').trim()
        const start = getString(draft, 'start').trim()
        if (value === '') errors.end = { key: 'endRequired' }
        else if (!MONTH.test(value)) errors.end = { key: 'month' }
        else if (MONTH.test(start) && value < start) errors.end = { key: 'endBeforeStart' }
        break
      }
      case 'tags':
        tagErrors(field, draft, errors)
        break
      case 'bullets':
        for (const locale of LOCALES) {
          const bullets = getStrings(draft, bulletsPath(locale))
          if (bullets.length < field.min) errors[bulletsPath(locale)] = { key: 'bulletsTooFew' }
          bullets.forEach((bullet, index) => {
            const trimmed = bullet.trim()
            const path = `${bulletsPath(locale)}.${index}`
            if (trimmed === '') errors[path] = { key: 'required' }
            else if (textLength(trimmed) > field.itemMax) errors[path] = { key: 'tooLong', values: { max: field.itemMax } }
          })
        }
        break
      case 'boolean':
        break
    }
  }
  // A placeholder project owns no image; the section stays visible so the image can be removed first.
  if (collection.id === 'projects' && getBoolean(draft, 'placeholder') && context.image) {
    errors.placeholder = { key: 'placeholderImage' }
  }
  return errors
}

/**
 * The paths that can show an error in the current form: one per rendered control, plus list-level
 * slots (a whole chip list, a whole locale's bullets) and one per chip row.
 */
export function errorSlots(collection: Collection, draft: Draft, mode: 'create' | 'edit'): Set<string> {
  const slots = new Set<string>()
  for (const field of collection.fields) {
    if (!isVisible(field, draft)) continue
    switch (field.kind) {
      case 'slug':
        if (mode === 'create') slots.add('slug')
        break
      case 'text':
        if (field.localized) for (const locale of LOCALES) slots.add(localizedPath(locale, field.name))
        else slots.add(field.name)
        break
      case 'boolean':
        slots.add(field.name)
        break
      case 'end':
        slots.add('end')
        break
      case 'tags':
        slots.add(field.name)
        getTags(draft, field.name).forEach((tag, index) => {
          slots.add(`${field.name}.${index}`)
          if (isTermTag(tag)) for (const locale of LOCALES) slots.add(`${field.name}.${index}.${locale}`)
        })
        break
      case 'bullets':
        for (const locale of LOCALES) {
          slots.add(bulletsPath(locale))
          getStrings(draft, bulletsPath(locale)).forEach((_, index) => slots.add(`${bulletsPath(locale)}.${index}`))
        }
        break
    }
  }
  return slots
}

/**
 * Places a 422 `fields` object on the form: each key goes to the most specific rendered slot it
 * starts with (`tech.3.str`, from a union validator, lands on chip 3) as a localized "rejected"
 * message; `body` (a rule about the whole row) and keys that match no control come back in
 * `unmatched` for form-level errors, so no rejection is ever silently dropped. The server's texts
 * are not kept: they are English, for developers.
 */
export function mapServerFields(
  fields: Readonly<Record<string, string>>,
  slots: ReadonlySet<string>,
): { errors: FieldErrors; unmatched: string[] } {
  const errors: Record<string, FieldError> = {}
  const unmatched: string[] = []
  for (const path of Object.keys(fields)) {
    let candidate = path === 'body' ? '' : path
    while (candidate !== '' && !slots.has(candidate)) {
      const cut = candidate.lastIndexOf('.')
      candidate = cut === -1 ? '' : candidate.slice(0, cut)
    }
    if (candidate === '') unmatched.push(path)
    else errors[candidate] ??= { key: 'serverRejected' }
  }
  return { errors, unmatched }
}
