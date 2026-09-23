import type { TFunction } from 'i18next'
import type { LanguageCode } from '../i18n/languages'
import { CONTACT_LINKS } from './contact'
import { EXPERIENCE } from './experience'
import { PROJECTS } from './projects'
import { CERTIFICATIONS, EDUCATION, SKILL_GROUPS, SPOKEN_LANGUAGES } from './skills'
import { isTerm, type Tag } from './tags'

/**
 * The one content shape the sections render: every string already in the requested locale, chips
 * resolved to plain text, no i18n keys and no term objects. It is exactly the payload of
 * `GET /api/v1/content?locale=...` (validated by `src/api/schemas.ts`), and `resolveStaticContent`
 * builds the same shape from the static modules plus i18n, so the API and the static fallback render
 * identically and the swap between them changes nothing that is already the same.
 */
export type Locale = LanguageCode

/** `YYYY-MM`; `formatMonth` turns it into the visible label. */
export type Month = string

export interface ResolvedExperience {
  readonly id: string
  /** Untranslated. */
  readonly company: string
  readonly role: string
  readonly location: string
  readonly start: Month
  /** `null` = current role; the UI prints `content.experience.present`. */
  readonly end: Month | null
  /** Reading order. */
  readonly bullets: readonly string[]
  /** Chips: proper nouns verbatim, descriptive terms in the locale. */
  readonly tech: readonly string[]
}

export interface ResolvedProject {
  readonly id: string
  /** A reserved slot: no title, summary, tech or link of its own. */
  readonly placeholder: boolean
  readonly title: string | null
  readonly summary: string | null
  readonly tech: readonly string[]
  /** Absolute http(s) URL, or `null`. */
  readonly url: string | null
}

export interface ResolvedSkillGroup {
  readonly id: string
  readonly label: string
  readonly items: readonly string[]
}

export interface ResolvedEducation {
  readonly id: string
  readonly degree: string
  /** Untranslated. */
  readonly school: string
  readonly year: string
}

export interface ResolvedCertification {
  readonly id: string
  /** Untranslated; the status suffix comes from `content.skills.credentials.certifications.inProgress`. */
  readonly name: string
  readonly inProgress: boolean
}

export interface ResolvedSpokenLanguage {
  readonly id: string
  readonly name: string
}

export interface ResolvedContactLink {
  readonly id: string
  readonly label: string
  /** Shown verbatim: an address, a URL or a handle. */
  readonly href: string
  readonly display: string
}

export interface ResolvedContent {
  /** Echoes the request; a payload for another locale than the active one is discarded. */
  readonly locale: Locale
  /** Newest first. */
  readonly experience: readonly ResolvedExperience[]
  readonly projects: readonly ResolvedProject[]
  readonly skills: {
    readonly groups: readonly ResolvedSkillGroup[]
    readonly education: readonly ResolvedEducation[]
    readonly certifications: readonly ResolvedCertification[]
    readonly languages: readonly ResolvedSpokenLanguage[]
  }
  readonly contact: {
    readonly links: readonly ResolvedContactLink[]
    /** Empty when unset. */
    readonly location: string
  }
}

/**
 * The static snapshot: `src/content/*.ts` plus the i18n prose for `locale`, resolved the way the
 * API resolves its rows. `t` must be the translator of that locale (`useTranslation().t`, or
 * `i18n.getFixedT(locale)`), so the two never disagree.
 */
export function resolveStaticContent(t: TFunction, locale: Locale): ResolvedContent {
  const text = (tag: Tag): string => (isTerm(tag) ? t(`content.terms.${tag.term}`) : tag)

  return {
    locale,
    experience: EXPERIENCE.map((entry) => {
      const base = `content.experience.${entry.id}`
      return {
        id: entry.id,
        company: entry.company,
        role: t(`${base}.role`),
        location: t(`${base}.location`),
        start: entry.start,
        end: entry.end,
        bullets: entry.bullets.map((key) => t(`${base}.bullets.${key}`)),
        tech: entry.tech.map(text),
      }
    }),
    projects: PROJECTS.map((project) => {
      const base = `content.projects.items.${project.id}`
      return {
        id: project.id,
        placeholder: project.placeholder,
        title: project.placeholder ? null : t(`${base}.title`),
        summary: project.placeholder ? null : t(`${base}.summary`),
        tech: project.tech.map(text),
        url: project.url ?? null,
      }
    }),
    skills: {
      groups: SKILL_GROUPS.map((group) => ({
        id: group.id,
        label: t(`content.skills.groups.${group.id}`),
        items: group.items.map(text),
      })),
      education: EDUCATION.map((entry) => ({
        id: entry.id,
        degree: t(`content.skills.credentials.education.${entry.id}`),
        school: entry.school,
        year: entry.year,
      })),
      certifications: CERTIFICATIONS.map((certification) => ({
        id: certification.id,
        name: certification.name,
        inProgress: certification.inProgress,
      })),
      languages: SPOKEN_LANGUAGES.map((id) => ({ id, name: t(`content.skills.credentials.languages.${id}`) })),
    },
    contact: {
      links: CONTACT_LINKS.map((link) => ({
        id: link.id,
        label: t(`content.contact.labels.${link.id}`),
        href: link.href,
        display: link.display,
      })),
      location: t('content.contact.location'),
    },
  }
}
