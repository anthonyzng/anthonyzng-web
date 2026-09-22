import { BELOW_MD, MD_UP, MOTION_QUERY } from '../animations/media'

type Matcher = (query: string) => boolean
type ChangeListener = (event: MediaQueryListEvent) => void

/** The default: nothing matches (light OS theme, no motion preference reported), so tests take the static path. */
const noMatch: Matcher = () => false

/** Opt-in motion on a tall fine-pointer desktop: motion queries match, below-md queries do not. */
export const motionMatcher: Matcher = (query) => query.includes(MOTION_QUERY) && !query.includes(BELOW_MD)

/** Opt-in motion on a desktop the pin does not fit (shorter than 600px). */
export const shortDesktopMotionMatcher: Matcher = (query) => motionMatcher(query) && !query.includes('min-height')

/** Opt-in motion at a phone width: motion and below-md queries match, md-and-up queries do not. */
export const mobileMotionMatcher: Matcher = (query) => query.includes(MOTION_QUERY) && !query.includes(MD_UP)

let matcher: Matcher = noMatch
const lists = new Map<string, FakeMediaQueryList>()

class FakeMediaQueryList {
  readonly media: string
  onchange: ((event: MediaQueryListEvent) => void) | null = null
  private readonly listeners = new Set<ChangeListener>()

  constructor(media: string) {
    this.media = media
  }

  /** Evaluated on every read, so setMatchMedia() applies to lists created earlier. */
  get matches(): boolean {
    return matcher(this.media)
  }

  addEventListener(type: string, listener: ChangeListener): void {
    if (type === 'change') this.listeners.add(listener)
  }

  removeEventListener(type: string, listener: ChangeListener): void {
    if (type === 'change') this.listeners.delete(listener)
  }

  addListener(listener: ChangeListener): void {
    this.listeners.add(listener)
  }

  removeListener(listener: ChangeListener): void {
    this.listeners.delete(listener)
  }

  dispatchEvent(): boolean {
    return true
  }

  emit(matches: boolean): void {
    const event = { matches, media: this.media } as MediaQueryListEvent
    for (const listener of [...this.listeners]) listener(event)
    this.onchange?.(event)
  }
}

function getList(query: string): FakeMediaQueryList {
  let list = lists.get(query)
  if (!list) {
    list = new FakeMediaQueryList(query)
    lists.set(query, list)
  }
  return list
}

export function installMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => getList(query) as unknown as MediaQueryList,
  })
}

export function setMatchMedia(next: Matcher): void {
  matcher = next
}

export function resetMatchMedia(): void {
  matcher = noMatch
  lists.clear()
}

/** Dispatches a `change` event to every listener of `query`. */
export function fireMediaChange(query: string, matches: boolean): void {
  getList(query).emit(matches)
}
