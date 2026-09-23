import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { readAnchor, restoreAnchor, type ScrollAnchor } from '../animations/readingPosition'
import { useLenis } from '../animations/useSmoothScroll'
import { scheduleScrollTriggerRefresh } from '../animations/useScrollTriggerRefresh'
import { ApiHttpError, ApiPayloadError, isAbortError } from '../api/client'
import { fetchContent } from '../api/content'
import { resolveLanguage } from '../i18n/languages'
import { isSameJson } from './isSameContent'
import { resolveStaticContent, type Locale, type ResolvedContent } from './resolved'

/**
 * The site content for the active locale. It returns the static snapshot (`src/content` + i18n)
 * synchronously, so the first paint is complete and needs no network, then asks the API for the
 * same locale and swaps its payload in. Anything short of a valid payload for the active locale
 * (network error, non-200, a body the schema rejects, a payload for another locale) keeps the
 * static snapshot; so does a payload that repeats it, which would only cost a re-render. After a
 * real swap the section heights may have changed, so ScrollTrigger is asked to re-measure through
 * the same safe refresh a late font load uses, and the reader is kept in place: the section under
 * the header (and how far into it they were) is read just before the swap and restored before the
 * next paint. A deep link or a language switch that already landed stays landed even when the API
 * answers after the landing's own font correction.
 *
 * The locale is the source of truth: a change refetches, and a payload for the previous locale is
 * never shown against the new one (the page also remounts on a language switch, which resets this).
 */
export function useContent(): ResolvedContent {
  const { t, i18n } = useTranslation()
  const locale: Locale = resolveLanguage(i18n.language)
  const fallback = useMemo(() => resolveStaticContent(t, locale), [t, locale])
  const [remote, setRemote] = useState<ResolvedContent | null>(null)
  const lenis = useLenis()
  const anchor = useRef<ScrollAnchor | null>(null)

  // `fallback` only changes with the locale (or its translator), so it is the snapshot of this locale.
  useEffect(() => {
    const controller = new AbortController()
    void fetchContent(locale, controller.signal).then(
      (payload) => {
        if (controller.signal.aborted || payload.locale !== locale) return
        if (isSameJson(payload, fallback)) return
        // Read while the page still shows the static content: afterwards the sections above the
        // reader may be taller or shorter.
        anchor.current = readAnchor()
        setRemote(payload)
      },
      (error: unknown) => {
        if (isAbortError(error)) return
        // A backend that answers wrongly is worth a note in development; one that is simply not
        // running already shows as a failed request in the console and is expected there.
        if (import.meta.env.DEV && (error instanceof ApiHttpError || error instanceof ApiPayloadError)) {
          console.warn('[content] static content kept', error)
        }
      },
    )
    return () => controller.abort()
  }, [locale, fallback])

  const content = remote !== null && remote.locale === locale ? remote : fallback

  // Before paint, so the reader never sees the page jump: back to the anchor read before the swap.
  // A reader already mid-scroll is left alone (pulling them back would fight their own scroll).
  useLayoutEffect(() => {
    const saved = anchor.current
    anchor.current = null
    if (saved && !lenis?.isScrolling) restoreAnchor(saved, lenis)
  }, [content, lenis])

  useEffect(() => {
    if (content !== fallback) scheduleScrollTriggerRefresh()
  }, [content, fallback])

  return content
}
