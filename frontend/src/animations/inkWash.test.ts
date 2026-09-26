import { describe, expect, it } from 'vitest'
import { createInkRenderer, parseHexColor } from './inkWash'

describe('ink wash', () => {
  it('reads the page colour from a hex token', () => {
    expect(parseHexColor('#0b1120')).toEqual([11 / 255, 17 / 255, 32 / 255])
    expect(parseHexColor(' #FFF ')).toEqual([1, 1, 1])
    for (const value of ['', 'rgb(0 0 0)', '#12345', 'oklch(0.2 0 0)']) expect(parseHexColor(value), value).toBeNull()
  })

  it('gives no renderer without WebGL, so the hero stays static', () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement
    expect(createInkRenderer(canvas)).toBeNull()
  })
})
