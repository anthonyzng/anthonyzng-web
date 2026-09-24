import type { Draft } from './draft'
import type { Locale } from './schemas'

/**
 * The editor is driven by one list of field configs per collection (collections.ts). A config
 * names draft paths, limits and i18n keys; `FieldRenderer` turns it into controls and
 * `validateDraft` into the same checks the backend applies, so a save is rarely rejected
 * server-side. `label` and `hint` are keys under `fields.*` and `hints.*` of the admin namespace.
 */

interface FieldBase {
  label: string
  hint?: string
  /** Shown (and validated) only while this holds, e.g. a project's copy is hidden for a placeholder. */
  visible?: (draft: Draft) => boolean
}

/** Editable on create only, suggested from `source` (a draft path) until the user types their own. */
export interface SlugField extends FieldBase {
  kind: 'slug'
  source: string | null
}

export type TextControl = 'text' | 'textarea' | 'url' | 'month' | 'year'

/** A string. `localized` fields hold one value per locale under `translations.<locale>.<name>`. */
export interface TextField extends FieldBase {
  kind: 'text'
  control: TextControl
  name: string
  localized: boolean
  /** In characters (code points), as the backend counts them. */
  max: number
  required: boolean | ((draft: Draft) => boolean)
  /** `url` only: `web` accepts http(s):// addresses, `link` also accepts mailto: addresses. */
  scheme?: 'web' | 'link'
}

export interface BooleanField extends FieldBase {
  kind: 'boolean'
  name: string
}

/** Experience `end`: a month, or `null` when the "current role" box is ticked. Checked against `start`. */
export interface EndField extends FieldBase {
  kind: 'end'
}

/** Chips: proper nouns (one text) or translated terms (English + Chinese). */
export interface TagsField extends FieldBase {
  kind: 'tags'
  name: string
  min: number
  max: number
}

/** Experience bullets: rows pairing `translations.en.bullets[i]` with `translations.zh-Hant.bullets[i]`. */
export interface BulletsField extends FieldBase {
  kind: 'bullets'
  min: number
  max: number
  itemMax: number
}

export type FieldConfig = SlugField | TextField | BooleanField | EndField | TagsField | BulletsField

/** The longest a chip may be (backend `NonEmptyStr`). */
export const TAG_MAX_LENGTH = 100

export const localizedPath = (locale: Locale, name: string): string => `translations.${locale}.${name}`

export const bulletsPath = (locale: Locale): string => localizedPath(locale, 'bullets')

export const isVisible = (field: FieldConfig, draft: Draft): boolean => field.visible?.(draft) ?? true

export const isRequired = (field: TextField, draft: Draft): boolean =>
  typeof field.required === 'function' ? field.required(draft) : field.required
