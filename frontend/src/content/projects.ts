import type { Tag } from './tags'

/**
 * Project cards. The real list is not written up yet, so the section ships the finished card layout
 * filled with cards that say so: `placeholder: true` cards carry no title, summary, tech or link of
 * their own, only the i18n placeholder copy under `content.projects.placeholder`.
 */
export interface Project {
  readonly id: string
  /** true: a reserved slot, labelled as such. false: real work, described under `content.projects.items.<id>`. */
  readonly placeholder: boolean
  readonly tech: readonly Tag[]
  readonly url?: string
}

export const PROJECTS: readonly Project[] = [
  { id: 'slotOne', placeholder: true, tech: [] },
  { id: 'slotTwo', placeholder: true, tech: [] },
]
