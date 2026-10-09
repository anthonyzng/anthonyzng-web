import { useEffect } from 'react'

/** The band in which a section counts as the one being read. */
const READING_BAND = '-40% 0px -40% 0px'
/** No scroll event for this long (ms): the page rests, and the glass thickens. */
const REST_MS = 220

/**
 * Drives the reading glass (`ReadingGlass`): marks each section with a glass `data-glass-active` while
 * it crosses the middle of the screen, and `<html>` `data-scrolling` while the page is moving. Mounted
 * once on the home page; `key` changes when the set of sections does (the archive, with the API's content).
 */
export function useReadingGlass(key: string): void {
  useEffect(() => {
    const root = document.documentElement
    let timer: ReturnType<typeof setTimeout> | undefined
    const rest = () => {
      delete root.dataset.scrolling
    }
    const onScroll = () => {
      if (!('scrolling' in root.dataset)) root.dataset.scrolling = ''
      clearTimeout(timer)
      timer = setTimeout(rest, REST_MS)
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    const sections = [...document.querySelectorAll('[data-glass]')]
      .map((glass) => glass.closest('section'))
      .filter((section): section is HTMLElement => section !== null)
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                const section = entry.target as HTMLElement
                if (entry.isIntersecting) section.dataset.glassActive = ''
                else delete section.dataset.glassActive
              }
            },
            { rootMargin: READING_BAND },
          )
    for (const section of sections) observer?.observe(section)

    return () => {
      window.removeEventListener('scroll', onScroll)
      clearTimeout(timer)
      rest()
      observer?.disconnect()
      for (const section of sections) delete section.dataset.glassActive
    }
  }, [key])
}
