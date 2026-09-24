import type { Locale, ResolvedContent } from './resolved'
import en from './snapshot/en.json'
import zhHant from './snapshot/zh-Hant.json'

/**
 * The static fallback: the last `GET /api/v1/content` payload of each locale, saved by
 * `npm run content:sync` into `snapshot/<locale>.json` and bundled with the site. The page paints it
 * at once, with no network, and keeps it whenever the API is unreachable or answers wrongly.
 *
 * The admin panel is the source of truth; after editing content there, re-run the sync and commit the
 * two files, or the first paint shows the previous content until the API answers (`useContent` then
 * swaps the new payload in). `snapshot.test.ts` validates both files against the same zod schema as
 * a live response, so the assertion below is checked where it matters.
 */
const SNAPSHOTS: Readonly<Record<Locale, ResolvedContent>> = {
  en: en as ResolvedContent,
  'zh-Hant': zhHant as ResolvedContent,
}

/** The saved content of `locale`; the same object on every call, so it is safe as a memo input. */
export function staticContent(locale: Locale): ResolvedContent {
  return SNAPSHOTS[locale]
}
