import type { SplitText } from 'gsap/SplitText'
import type { LanguageCode } from '../i18n/languages'

type SplitVars = NonNullable<Parameters<typeof SplitText.create>[1]>
export type SplitLocaleVars = Pick<SplitVars, 'prepareText' | 'wordDelimiter'>

const ZWSP = '​'
const NBSP = ' '
const WHITESPACE = /^\s+$/u
/** Closing, final and other punctuation and dashes (、。，！？：；」）——) glue to the previous word. */
const NO_BREAK_BEFORE = /^[\p{Pe}\p{Pf}\p{Po}\p{Pd}]+$/u
/** Opening and initial punctuation (「（『) glues to the next word. */
const NO_BREAK_AFTER = /^[\p{Ps}\p{Pi}]+$/u

/**
 * Splits text into line-breakable words using Intl.Segmenter, gluing punctuation so no line starts
 * with 、 or —— and no line ends with 「. A whitespace segment becomes a no-break space at the end of
 * the previous word, so "AI 驅動" keeps its space.
 */
export function segmentWords(text: string, segmenter: Intl.Segmenter): string[] {
  const words: string[] = []
  let glueNext = false
  for (const { segment } of segmenter.segment(text)) {
    const last = words.length - 1
    if (WHITESPACE.test(segment)) {
      if (last >= 0) words[last] += NBSP
      continue
    }
    if (last >= 0 && (glueNext || NO_BREAK_BEFORE.test(segment))) words[last] += segment
    else words.push(segment)
    glueNext = NO_BREAK_AFTER.test(segment)
  }
  return words
}

/**
 * Locale-specific SplitText vars. English uses the default space delimiter. Traditional Chinese has
 * no spaces, so words are segmented and joined with U+200B, which SplitText then uses as the word
 * delimiter (SplitText word boxes are atomic inlines, so lines can still wrap between them).
 * Returns null for Chinese without Intl.Segmenter: the caller then reveals the paragraph as one block.
 * Pass `null` as `Segmenter` to simulate a browser without it.
 */
export function splitVarsFor(
  language: LanguageCode,
  Segmenter: typeof Intl.Segmenter | null | undefined = globalThis.Intl?.Segmenter,
): SplitLocaleVars | null {
  if (language !== 'zh-Hant') return {}
  if (!Segmenter) return null
  const segmenter = new Segmenter('zh-Hant', { granularity: 'word' })
  return {
    prepareText: (text: string) => segmentWords(text, segmenter).join(ZWSP),
    wordDelimiter: { delimiter: /​/, replaceWith: '' },
  }
}
