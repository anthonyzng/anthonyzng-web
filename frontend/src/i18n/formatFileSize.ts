const KIB = 1024
const MIB = KIB * KIB

/**
 * A file size for a download label: `180 KB`, `1.4 MB` (binary units, as file managers show them).
 * The number is formatted for `language`; the unit symbols read the same in both locales. Anything
 * under 1 KB still reads `1 KB`, and a size that would round to four digits of KB is shown in MB.
 */
export function formatFileSize(bytes: number, language: string): string {
  const kilobytes = Math.max(1, Math.round(bytes / KIB))
  if (kilobytes < 1000) return `${new Intl.NumberFormat(language).format(kilobytes)} KB`
  const megabytes = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(bytes / MIB)
  return `${megabytes} MB`
}
