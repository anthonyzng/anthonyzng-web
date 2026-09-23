/**
 * Structural equality of two JSON-shaped values (objects, arrays, primitives, `null`), independent
 * of key order. Used to tell an API payload that repeats the static snapshot from one that changes
 * something, so an identical payload is never swapped in (no re-render, no ScrollTrigger refresh).
 */
export function isSameJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => isSameJson(item, b[index]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => Object.hasOwn(right, key) && isSameJson(left[key], right[key]))
}
