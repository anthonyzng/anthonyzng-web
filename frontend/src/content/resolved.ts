import type { LanguageCode } from '../i18n/languages'

/**
 * The one content shape the sections render: every string already in the requested locale, chips
 * resolved to plain text, no i18n keys and no term objects. It is exactly the payload of
 * `GET /api/v1/content?locale=...` (validated by `src/api/schemas.ts`), and the static fallback is a
 * saved copy of that payload (`staticContent.ts`), so the API and the fallback render identically
 * and the swap between them changes nothing that is already the same.
 */
export type Locale = LanguageCode

/** `YYYY-MM`; `formatMonth` turns it into the visible label. */
export type Month = string

export interface ResolvedExperience {
  readonly id: string
  /** Untranslated. */
  readonly company: string
  /** The employer's website, linked from the company name; null when there is none. */
  readonly companyUrl: string | null
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

/**
 * A file the API serves (`GET /api/v1/files/<id>`). `url` is a root-relative path on the API
 * origin; `fileUrl()` (src/api/files.ts) turns it into the address the browser loads.
 */
export interface ResolvedImage {
  readonly url: string
  /** Pixels of the stored WebP (at most 1600 wide). */
  readonly width: number
  readonly height: number
}

export interface ResolvedProject {
  readonly id: string
  /** A reserved slot: no title, summary, tech, link or image of its own. */
  readonly placeholder: boolean
  readonly title: string | null
  readonly summary: string | null
  readonly tech: readonly string[]
  /** Absolute http(s) URL, or `null`. */
  readonly url: string | null
  /** Cover image uploaded in the admin panel, or `null`. */
  readonly image: ResolvedImage | null
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

/** The downloadable CV (one PDF, uploaded in the admin panel). */
export interface ResolvedCv {
  /** Root-relative path on the API origin, like `ResolvedImage.url`. */
  readonly url: string
  /** The name the download is saved under. */
  readonly filename: string
  /** Bytes. */
  readonly size: number
  /** ISO 8601 upload time. */
  readonly updatedAt: string
}

export interface ResolvedContent {
  /** Echoes the request; a payload for another locale than the active one is discarded. */
  readonly locale: Locale
  /** In the order the admin panel sets (newest first by convention). */
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
  /** `null` until a CV is uploaded; the Contact section then offers no download. */
  readonly cv: ResolvedCv | null
}
