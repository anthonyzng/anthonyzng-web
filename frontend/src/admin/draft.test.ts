import { describe, expect, it } from 'vitest'
import { sameDraft } from './draft'

describe('sameDraft', () => {
  it('compares content, whatever the key order', () => {
    const draft = {
      slug: 'acme',
      tech: ['React', { en: 'Data pipelines', 'zh-Hant': '數據管道' }],
      translations: { en: { role: 'Lead' }, 'zh-Hant': { role: '主管' } },
    }
    const reordered = {
      translations: { 'zh-Hant': { role: '主管' }, en: { role: 'Lead' } },
      tech: ['React', { 'zh-Hant': '數據管道', en: 'Data pipelines' }],
      slug: 'acme',
    }
    expect(sameDraft(draft, reordered)).toBe(true)
  })

  it('still tells real differences apart: a value, the order of a list, a missing key', () => {
    const draft = { slug: 'acme', tech: ['React', 'Go'], end: null }
    expect(sameDraft(draft, { ...draft, slug: 'acme2' })).toBe(false)
    expect(sameDraft(draft, { ...draft, tech: ['Go', 'React'] })).toBe(false)
    expect(sameDraft(draft, { slug: 'acme', tech: ['React', 'Go'] })).toBe(false)
    expect(sameDraft(draft, { ...draft, end: '' })).toBe(false)
  })
})
