import type { LenisOptions, ScrollToOptions } from 'lenis'
import { vi } from 'vitest'

/**
 * Stand-in for Lenis in motion-enabled tests: `vi.mock('lenis', () => import('../test/fakeLenis'))`.
 * Records its options and every call; scrollTo() completes immediately.
 */
export class FakeLenis {
  static instances: FakeLenis[] = []
  static throwOnConstruct = false

  readonly options: LenisOptions
  on = vi.fn()
  raf = vi.fn()
  stop = vi.fn()
  start = vi.fn()
  resize = vi.fn()
  destroy = vi.fn()
  scrollTo = vi.fn((_target: unknown, options?: ScrollToOptions) => {
    options?.onComplete?.(this as never)
  })

  constructor(options: LenisOptions = {}) {
    if (FakeLenis.throwOnConstruct) throw new Error('Lenis unavailable')
    this.options = options
    FakeLenis.instances.push(this)
  }

  static reset(): void {
    FakeLenis.instances = []
    FakeLenis.throwOnConstruct = false
  }
}

export default FakeLenis
