import { describe, expect, it } from 'vitest'
import { codeError, normalizeCode } from './totpCode'

describe('authenticator codes', () => {
  it('drops the spaces people type or paste', () => {
    expect(normalizeCode(' 123 456\n')).toBe('123456')
  })

  it('accepts six ASCII digits only', () => {
    expect(codeError('123456')).toBeNull()
    expect(codeError('123 456')).toBeNull()
    expect(codeError('')).toBe('codeRequired')
    expect(codeError('   ')).toBe('codeRequired')
    for (const value of ['12345', '1234567', '12345a', '１２３４５６', '١٢٣٤٥٦']) {
      expect(codeError(value), value).toBe('codeFormat')
    }
  })
})
