/** Six ASCII digits, as the API takes an authenticator code (`\d` is ASCII-only without the `u` flag). */
const CODE = /^\d{6}$/

/** A code as typed or pasted: spaces ("123 456") and line breaks are dropped. */
export const normalizeCode = (value: string): string => value.replace(/\s+/g, '')

/** The error key for a code (`codeRequired` / `codeFormat`), or null when it can be sent. */
export function codeError(value: string): 'codeRequired' | 'codeFormat' | null {
  const code = normalizeCode(value)
  if (code === '') return 'codeRequired'
  return CODE.test(code) ? null : 'codeFormat'
}
