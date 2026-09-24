import type { Draft, Json } from '../draft'

/** What the form hands each field component: the draft, how to change it, and where errors show. */
export interface EditorApi {
  draft: Draft
  mode: 'create' | 'edit'
  /** Sets one path. Errors at that path and below it are cleared (the value changed). */
  update(path: string, value: Json): void
  /** Sets several paths in one change, e.g. both locales' bullet lists when a row moves. */
  updateMany(entries: readonly (readonly [string, Json])[]): void
  /** The slug typed by hand: from now on it no longer follows the suggestion. */
  editSlug(value: string): void
  /** The DOM id of the control for a path; its error is `${id}-error`, its hint `${id}-hint`. */
  controlId(path: string): string
  /** The translated error for a path, or null. */
  error(path: string): string | null
  /** Says something in the admin panel's live region (a moved or removed row). */
  announce(text: string): void
}
