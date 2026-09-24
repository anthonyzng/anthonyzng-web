import { isSameJson } from '../content/isSameContent'
import type { Tag } from './schemas'

/**
 * The editor's form state: a JSON object in the collection's write shape, with text inputs held as
 * strings (an empty optional URL is `''` until the payload turns it into `null`). Controls address
 * it by dotted paths (`translations.zh-Hant.bullets.2`, `tech.3`), the same paths the backend
 * uses for the keys of a 422 `fields` object, so a server error lands on the control it names.
 */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
export type Draft = { [key: string]: Json }

/** A plain JSON object (not null, not an array); parsed JSON holds only JSON values. */
export const isObject = (value: unknown): value is { [key: string]: Json } =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export function getAt(root: Json, path: string): Json | undefined {
  let current: Json | undefined = root
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) current = current[Number(segment)]
    else if (isObject(current)) current = current[segment]
    else return undefined
  }
  return current
}

function setIn(value: Json | undefined, segments: readonly string[], next: Json): Json {
  if (segments.length === 0) return next
  const [head, ...rest] = segments
  if (Array.isArray(value)) {
    const copy = [...value]
    copy[Number(head)] = setIn(value[Number(head)], rest, next)
    return copy
  }
  const object = isObject(value) ? value : {}
  return { ...object, [head]: setIn(object[head], rest, next) }
}

/** An immutable update: every object and array along the path is copied, everything else is shared. */
export function setAt(draft: Draft, path: string, next: Json): Draft {
  return setIn(draft, path.split('.'), next) as Draft
}

export const getString = (draft: Draft, path: string): string => {
  const value = getAt(draft, path)
  return typeof value === 'string' ? value : ''
}

export const getBoolean = (draft: Draft, path: string): boolean => getAt(draft, path) === true

export const getStrings = (draft: Draft, path: string): string[] => {
  const value = getAt(draft, path)
  return Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item : '')) : []
}

export const isTermTag = (tag: Tag): tag is Exclude<Tag, string> => typeof tag !== 'string'

/** Exactly the write shape of a chip: a term keeps only its two locales (the tag schema does not strip keys). */
export const cleanTag = (tag: Tag): Tag => (isTermTag(tag) ? { en: tag.en, 'zh-Hant': tag['zh-Hant'] } : tag)

export const getTags = (draft: Draft, path: string): Tag[] => {
  const value = getAt(draft, path)
  if (!Array.isArray(value)) return []
  return value.map((item): Tag => {
    if (typeof item === 'string') return item
    if (isObject(item)) {
      const en = item.en
      const zh = item['zh-Hant']
      return { en: typeof en === 'string' ? en : '', 'zh-Hant': typeof zh === 'string' ? zh : '' }
    }
    return ''
  })
}

/** Every string trimmed, recursively: the backend trims too, so this is what it will store. */
export function trimDeep(value: Json): Json {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.map(trimDeep)
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trimDeep(item)]))
  return value
}

/** A copy of `list` with the entries at `a` and `b` exchanged (a row moved one place). */
export function swapped<T>(list: readonly T[], a: number, b: number): T[] {
  const next = [...list]
  next[a] = list[b]
  next[b] = list[a]
  return next
}

/**
 * Structural equality, whatever the key order: a draft read back from storage, or built from a row
 * whose keys the server ordered differently, must still equal the same content built here.
 */
export const sameDraft = (a: Draft, b: Draft): boolean => isSameJson(a, b)

/** The length the backend measures: Python counts code points, not UTF-16 units. */
export const textLength = (value: string): number => [...value].length
