type EntryInit = Partial<IntersectionObserverEntry> & { target: Element }

/** Records every instance; tests drive it with trigger(). */
export class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  readonly root = null
  readonly rootMargin: string
  readonly thresholds: readonly number[] = [0]
  readonly targets = new Set<Element>()
  private readonly callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    this.callback = callback
    this.rootMargin = options.rootMargin ?? '0px'
    MockIntersectionObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.targets.add(target)
  }

  unobserve(target: Element): void {
    this.targets.delete(target)
  }

  disconnect(): void {
    this.targets.clear()
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  trigger(entries: EntryInit[]): void {
    const full = entries.map((entry) => ({
      isIntersecting: false,
      intersectionRatio: entry.isIntersecting ? 1 : 0,
      time: 0,
      rootBounds: null,
      boundingClientRect: entry.target.getBoundingClientRect(),
      intersectionRect: entry.target.getBoundingClientRect(),
      ...entry,
    }))
    this.callback(full as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
  }

  static reset(): void {
    MockIntersectionObserver.instances = []
  }
}

export class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

export function installObservers(): void {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: MockResizeObserver,
  })
}
