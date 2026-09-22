import { describe, expect, it } from 'vitest'
import { segmentWords, splitVarsFor } from './splitText'

const ZWSP = '​'
const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'word' })

describe('splitVarsFor', () => {
  it('uses the default space delimiter for English', () => {
    expect(splitVarsFor('en')).toEqual({})
  })

  it('returns null for Chinese without Intl.Segmenter', () => {
    expect(splitVarsFor('zh-Hant', null)).toBeNull()
  })

  it('joins Chinese words with U+200B and a matching delimiter', () => {
    const vars = splitVarsFor('zh-Hant')
    const input = '我設計並開發端到端的軟件'
    const prepared = vars?.prepareText?.(input, document.createElement('p')) ?? ''
    expect(prepared).toContain(ZWSP)
    expect(prepared.startsWith(ZWSP)).toBe(false)
    expect(prepared.endsWith(ZWSP)).toBe(false)
    expect(prepared.replaceAll(ZWSP, '')).toBe(input)
    expect(vars?.wordDelimiter).toEqual({ delimiter: /​/, replaceWith: '' })
  })
})

describe('segmentWords', () => {
  it('glues punctuation to the previous word and keeps spaces as no-break spaces', () => {
    const words = segmentWords('由可擴展的後端、AI 驅動的功能', segmenter)
    expect(words.some((word) => word.startsWith('、'))).toBe(false)
    expect(words.some((word) => /^\s/u.test(word))).toBe(false)
    expect(words.some((word) => word.endsWith('AI '))).toBe(true)
  })

  it('never starts a word with a dash', () => {
    const words = segmentWords('我設計並開發端到端的軟件——由可擴展的後端', segmenter)
    expect(words.some((word) => word.startsWith('—'))).toBe(false)
  })

  it('glues an opening bracket to the following word', () => {
    const words = segmentWords('請看「引號」內容', segmenter)
    expect(words).toContain('「引號」')
    expect(words.some((word) => word === '「' || word.endsWith('「'))).toBe(false)
  })

  it('handles the full statement copy', () => {
    const intro = '我設計並開發端到端的軟件——由可擴展的後端、AI 驅動的功能，到精緻的使用者介面——並帶領團隊將產品推出。'
    const words = segmentWords(intro, segmenter)
    for (const word of words) expect(word).not.toMatch(/^[、，。——]/u)
    expect(words.join('').replaceAll(' ', ' ')).toBe(intro)
  })
})
