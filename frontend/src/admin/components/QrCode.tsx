import { useMemo } from 'react'
import { encode } from 'uqr'

interface QrCodeProps {
  value: string
  /** What the code carries, for screen readers (the secret itself is shown as text next to it). */
  label: string
}

/**
 * A QR code drawn as one SVG path, dark on light in both themes (scanners expect that contrast),
 * with the standard four-module quiet zone. Error correction M: readable from a slightly blurry
 * phone camera without making the code dense.
 */
export function QrCode({ value, label }: QrCodeProps) {
  const { path, size } = useMemo(() => {
    const { data } = encode(value, { ecc: 'M', border: 4 })
    let d = ''
    data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`
      }),
    )
    return { path: d, size: data.length }
  }, [value])

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="block size-56 bg-white text-black"
    >
      <path d={path} fill="currentColor" />
    </svg>
  )
}
