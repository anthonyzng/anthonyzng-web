/**
 * Chips shown by `TagList` (technologies under a role, skills in a group, a project's stack).
 *
 * A chip is one of two things:
 * - a proper noun (`'React'`, `'Microsoft Azure'`, `'ABAP'`), which reads the same in both locales
 *   and therefore stays here as data;
 * - a descriptive term (`term('dataPipelines')`), which is ordinary prose and must be translated;
 *   its text lives under `content.terms.<id>` in both locale files.
 *
 * Both forms stay serialisable, so Phase 4 can return them from the API unchanged
 * (`"React"` / `{"term":"dataPipelines"}`).
 */
export interface TermTag {
  readonly term: string
}

export type Tag = string | TermTag

/** A chip whose text is translated under `content.terms.<id>`. */
export const term = (id: string): TermTag => ({ term: id })

export const isTerm = (tag: Tag): tag is TermTag => typeof tag !== 'string'

/** The i18n key a term chip reads, or `null` for a proper noun. */
export const tagKey = (tag: Tag): string | null => (isTerm(tag) ? `content.terms.${tag.term}` : null)
